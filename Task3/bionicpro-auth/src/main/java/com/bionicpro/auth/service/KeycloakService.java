package com.bionicpro.auth.service;

import com.bionicpro.auth.model.SessionInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;

@Service
public class KeycloakService {

    @Value("${keycloak.server-url}")
    private String keycloakServerUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    private final WebClient webClient = WebClient.builder().build();

    // In-memory storage for temporary data
    private final java.util.Map<String, String> codeVerifierStorage = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<String, String[]> stateDataStorage = new java.util.concurrent.ConcurrentHashMap<>();

    public String getKeycloakServerUrl() {
        return keycloakServerUrl;
    }

    public String getRealm() {
        return realm;
    }

    public String storeCodeVerifierAndGetToken(String codeVerifier) {
        // Генерируем уникальный токен
        String token = java.util.UUID.randomUUID().toString();
        
        // Сохраняем code_verifier с коротким сроком действия (например, 2 минуты)
        // Для простоты в памяти мы не будем реализовывать автоматическое удаление по времени
        // В реальной системе нужно использовать ScheduledExecutorService или аналогичный механизм
        codeVerifierStorage.put(token, codeVerifier);
        
        return token;
    }

    public String retrieveCodeVerifierByToken(String token) {
        // Извлекаем code_verifier по токену
        String codeVerifier = codeVerifierStorage.get(token);
        
        // Удаляем после использования для дополнительной безопасности
        codeVerifierStorage.remove(token);
        
        return codeVerifier;
    }

    public void storeOriginalRedirectUriAndCodeVerifier(String state, String originalRedirectUri, String codeVerifier) {
        // Сохраняем оригинальный redirect_uri и code_verifier
        String[] data = {originalRedirectUri, codeVerifier};
        stateDataStorage.put(state, data);
    }
    
    public void storeOriginalRedirectUriAndCodeVerifierWithTokenExchangeUri(String state, String originalRedirectUri, String codeVerifier, String tokenExchangeRedirectUri) {
        // Сохраняем оригинальный redirect_uri, code_verifier и redirect_uri для обмена токенов
        String[] data = {originalRedirectUri, codeVerifier, tokenExchangeRedirectUri};
        stateDataStorage.put(state, data);
    }

    public String[] retrieveOriginalRedirectUriAndCodeVerifier(String state) {
        // Извлекаем оригинальный redirect_uri и code_verifier по state
        String[] data = stateDataStorage.get(state);
        
        // Удаляем после использования для дополнительной безопасности
        stateDataStorage.remove(state);
        
        return data;
    }

    public SessionInfo exchangeCodeForTokens(String code, String redirectUri, String codeVerifier) throws Exception {
        // Логирование параметров для отладки
        System.out.println("DEBUG: exchangeCodeForTokens called with:");
        System.out.println("  code: " + code);
        System.out.println("  redirectUri: " + redirectUri);
        System.out.println("  codeVerifier: " + codeVerifier);
        System.out.println("  client_id: " + clientId);
        
        String tokenEndpoint = keycloakServerUrl + "/realms/" + realm + "/protocol/openid-connect/token";
        System.out.println("  tokenEndpoint: " + tokenEndpoint);

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("grant_type", "authorization_code");
        formData.add("client_id", clientId);
        // Не добавляем client_secret для public клиентов
        formData.add("code", code);
        formData.add("redirect_uri", redirectUri);
        formData.add("code_verifier", codeVerifier); // Add PKCE code verifier

        // Логирование формы для отладки
        System.out.println("  form data: grant_type=authorization_code, client_id=" + clientId + 
                          ", code=..., redirect_uri=" + redirectUri + ", code_verifier=...");

        Mono<KeycloakTokenResponse> responseMono = webClient.post()
            .uri(tokenEndpoint)
            .body(BodyInserters.fromFormData(formData))
            .retrieve()
            .onStatus(httpStatus -> httpStatus.value() >= 400, (clientResponse) -> {
                System.out.println("DEBUG: Error response status: " + clientResponse.statusCode());
                return clientResponse.bodyToMono(String.class).flatMap(errorBody -> {
                    System.out.println("DEBUG: Error response body: " + errorBody);
                    return Mono.error(new RuntimeException("Error exchanging code for tokens: " + errorBody));
                });
            })
            .bodyToMono(KeycloakTokenResponse.class);

        KeycloakTokenResponse response = responseMono.block();

        String accessToken = response.getAccess_token();
        String refreshToken = response.getRefresh_token();
        int expiresIn = response.getExpires_in(); // in seconds

        LocalDateTime AccessTokenExpiry = LocalDateTime.now().plusSeconds(expiresIn);
        // Session expiry is longer than access token expiry
        LocalDateTime sessionExpiry = LocalDateTime.now().plusMinutes(30); // 30 minutes session

        String sessionId = java.util.UUID.randomUUID().toString();

        System.out.println("DEBUG: Successfully exchanged code for tokens");
        return new SessionInfo(sessionId, accessToken, refreshToken, AccessTokenExpiry, sessionExpiry);
    }

    public SessionInfo refreshAccessToken(String refreshToken) throws Exception {
        String tokenEndpoint = keycloakServerUrl + "/realms/" + realm + "/protocol/openid-connect/token";

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("grant_type", "refresh_token");
        formData.add("client_id", clientId);
        // Не добавляем client_secret для public клиентов
        formData.add("refresh_token", refreshToken);

        Mono<KeycloakTokenResponse> responseMono = webClient.post()
            .uri(tokenEndpoint)
            .body(BodyInserters.fromFormData(formData))
            .retrieve()
            .bodyToMono(KeycloakTokenResponse.class);

        KeycloakTokenResponse response = responseMono.block();

        String newAccessToken = response.getAccess_token();
        String newRefreshToken = response.getRefresh_token() != null ? 
            response.getRefresh_token() : refreshToken; // Use old refresh token if not rotated
        int expiresIn = response.getExpires_in(); // in seconds

        LocalDateTime accessTokenExpiry = LocalDateTime.now().plusSeconds(expiresIn);

        return new SessionInfo(null, newAccessToken, newRefreshToken, accessTokenExpiry, null);
    }

    // Inner class to represent Keycloak token response
    public static class KeycloakTokenResponse {
        private String access_token;
        private String refresh_token;
        private int expires_in;
        private String token_type;

        // Getters and setters
        public String getAccess_token() {
            return access_token;
        }

        public void setAccess_token(String access_token) {
            this.access_token = access_token;
        }

        public String getRefresh_token() {
            return refresh_token;
        }

        public void setRefresh_token(String refresh_token) {
            this.refresh_token = refresh_token;
        }

        public int getExpires_in() {
            return expires_in;
        }

        public void setExpires_in(int expires_in) {
            this.expires_in = expires_in;
        }

        public String getToken_type() {
            return token_type;
        }

        public void setToken_type(String token_type) {
            this.token_type = token_type;
        }
    }
}