package com.bionicpro.auth.controller;

import com.bionicpro.auth.model.SessionInfo;
import com.bionicpro.auth.service.KeycloakService;
import com.bionicpro.auth.service.SessionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private KeycloakService keycloakService;

    @Autowired
    private SessionService sessionService;

    /**
     * Endpoint для сохранения code_verifier и получения токена
     */
    @PostMapping("/store-code-verifier")
    public ResponseEntity<?> storeCodeVerifier(@RequestBody CodeVerifierRequest request) {
        String token = keycloakService.storeCodeVerifierAndGetToken(request.getCodeVerifier());
        return ResponseEntity.ok(new CodeVerifierTokenResponse(token));
    }

    /**
     * Endpoint для инициации OAuth flow - принимает параметры от фронтенда и перенаправляет на Keycloak
     */
    @GetMapping("/initiate-oauth-with-token")
    public ResponseEntity<Void> initiateOAuthWithToken(
            @RequestParam String clientId,
            @RequestParam String originalRedirectUri,
            @RequestParam String responseType,
            @RequestParam String scope,
            @RequestParam String state,
            @RequestParam String codeChallenge,
            @RequestParam String codeChallengeMethod,
            @RequestParam String token,
            HttpServletRequest request,
            HttpServletResponse response) {

        // Получаем code_verifier по токену
        String codeVerifier = keycloakService.retrieveCodeVerifierByToken(token);

        if (codeVerifier == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Формируем URL, который будет использоваться для обмена токенов
        String tokenExchangeRedirectUri = request.getRequestURL().toString().replace("/initiate-oauth-with-token", "/callback"); // URL, который будет использоваться для обмена токенов
        // Сохраняем оригинальный redirect_uri, code_verifier и redirect_uri для обмена токенов для последующего использования при обработке callback
        keycloakService.storeOriginalRedirectUriAndCodeVerifierWithTokenExchangeUri(state, originalRedirectUri, codeVerifier, tokenExchangeRedirectUri);

        // Формируем URL для редиректа на Keycloak
        // Заменяем внутренний адрес keycloak:8080 на внешний localhost:8080 для редиректа в браузере
        String keycloakPublicUrl = keycloakService.getKeycloakServerUrl().replace("keycloak:8080", "localhost:8080");
        String keycloakAuthUrl = String.format("%s/realms/%s/protocol/openid-connect/auth?" +
                "client_id=%s&" +
                "redirect_uri=%s&" +
                "response_type=%s&" +
                "scope=%s&" +
                "state=%s&" +
                "code_challenge=%s&" +
                "code_challenge_method=%s",
                keycloakPublicUrl,
                keycloakService.getRealm(),
                clientId,
                tokenExchangeRedirectUri, // Используем текущий URL как callback
                responseType,
                scope,
                state,
                codeChallenge,
                codeChallengeMethod);

        return ResponseEntity.status(302).header("Location", keycloakAuthUrl).build();
    }

    /**
     * Endpoint для обработки OAuth callback - получает authorization code и создает сессию
     */
    @GetMapping("/callback")
    public ResponseEntity<Void> handleOAuthCallback(
            @RequestParam String code,
            @RequestParam String state,
            HttpServletRequest request,
            HttpServletResponse httpResponse) {

        try {
            // Получаем оригинальный redirect_uri, code_verifier и redirect_uri для обмена токенов из безопасного хранилища по state
            String[] storedData = keycloakService.retrieveOriginalRedirectUriAndCodeVerifier(state);

            if (storedData == null || storedData.length != 3) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }

            String originalRedirectUri = storedData[0];
            String codeVerifier = storedData[1];
            String tokenExchangeRedirectUri = storedData[2]; // redirect_uri для обмена токенов

            if (codeVerifier == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }

            // Обмениваем authorization code на access и refresh токены
            SessionInfo sessionInfo = keycloakService.exchangeCodeForTokens(
                code,
                tokenExchangeRedirectUri, // Используем сохраненный redirect_uri для обмена токенов
                codeVerifier
            );

            // Создаем сессию
            String sessionId = sessionService.createSession(sessionInfo);

            // Устанавливаем сессионный токен как cookie
            Cookie sessionCookie = new Cookie("SESSION_ID", sessionId);
            sessionCookie.setHttpOnly(true);
            sessionCookie.setSecure(false); // Set to true in production with HTTPS
            sessionCookie.setPath("/");
            // Устанавливаем время жизни cookie равным времени жизни сессии
            long maxAge = java.time.Duration.between(
                java.time.LocalDateTime.now(),
                sessionInfo.getSessionExpiry()
            ).getSeconds();
            sessionCookie.setMaxAge((int) maxAge);

            httpResponse.addCookie(sessionCookie);

            // Редиректим пользователя на оригинальный redirect_uri (фронтенд)
            return ResponseEntity.status(302).header("Location", originalRedirectUri).build();
        } catch (Exception e) {
            // В реальности здесь нужно бы обработать ошибку красиво
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }


    /**
     * Endpoint для проверки валидности сессии
     */
    @GetMapping("/validate-session")
    public ResponseEntity<?> validateSession(@CookieValue(value = "SESSION_ID", required = false) String sessionId) {
        if (sessionId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("No session found"));
        }

        try {
            SessionInfo sessionInfo = sessionService.validateAndRefreshSession(sessionId);
            return ResponseEntity.ok().body(new SessionValidationResponse("Session is valid", true, sessionId));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Invalid session: " + e.getMessage()));
        }
    }

    /**
     * Endpoint для обновления access token с использованием refresh token
     */
    @PostMapping("/refresh-token")
    public ResponseEntity<?> refreshToken(@CookieValue(value = "SESSION_ID", required = false) String sessionId) {
        if (sessionId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("No session found"));
        }

        try {
            SessionInfo updatedSessionInfo = sessionService.refreshAccessToken(sessionId);
            return ResponseEntity.ok().body(new RefreshTokenResponse("Token refreshed successfully", updatedSessionInfo.getAccessToken()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Token refresh failed: " + e.getMessage()));
        }
    }

    /**
     * Endpoint для получения user ID по сессии
     */
    @GetMapping("/user-info")
    public ResponseEntity<?> getUserInfo(@CookieValue(value = "SESSION_ID", required = false) String sessionId) {
        if (sessionId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("No session found"));
        }

        System.out.println("Получаем ID по сессии");
        System.out.println("--------------------");
        System.out.println("SESSION_ID: "+sessionId);

        try {
            SessionInfo sessionInfo = sessionService.validateAndRefreshSession(sessionId);

            // Decode the JWT to get the 'sub' (user ID)
            // We'll use a utility method to decode the JWT without verification since it comes from our trusted Keycloak
            String userId = extractUserIdFromToken(sessionInfo.getAccessToken());

            if (userId == null) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Could not extract user ID from token"));
            }

            System.out.println("USER ID: "+userId);

            return ResponseEntity.ok().body(new UserInfoResponse(userId));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Invalid session: " + e.getMessage()));
        }
    }

    /**
     * Utility method to extract user ID from JWT token
     */
    private String extractUserIdFromToken(String accessToken) {
        try {
            // Split the JWT token to get the payload
            String[] chunks = accessToken.split("\\.");
            if (chunks.length != 3) {
                return null;
            }

            // Decode the payload part (second chunk)
            String payload = chunks[1];
            // Add padding if needed
            int padLength = (4 - (payload.length() % 4)) % 4;
            StringBuilder sb = new StringBuilder(payload);
            for (int i = 0; i < padLength; i++) {
                sb.append("=");
            }
            payload = sb.toString();

            // Decode from base64
            byte[] decodedBytes = java.util.Base64.getDecoder().decode(payload);
            String payloadJson = new String(decodedBytes, "UTF-8");

            // Parse JSON to extract sub
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode rootNode = mapper.readTree(payloadJson);

            return rootNode.path("sub").asText();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    /**
     * Endpoint для выхода из системы
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@CookieValue(value = "SESSION_ID", required = false) String sessionId,
                                   HttpServletResponse response) {
        if (sessionId != null) {
            sessionService.invalidateSession(sessionId);
        }

        // Удаляем cookie сессии
        Cookie sessionCookie = new Cookie("SESSION_ID", null);
        sessionCookie.setHttpOnly(true);
        sessionCookie.setSecure(false); // Set to true in production with HTTPS
        sessionCookie.setPath("/");
        sessionCookie.setMaxAge(0); // Expire immediately

        response.addCookie(sessionCookie);

        return ResponseEntity.ok().body(new SuccessResponse("Logged out successfully"));
    }

    // DTOs
    public static class OAuthCallbackRequest {
        private String code;
        private String redirectUri;
        private String codeVerifier;

        public OAuthCallbackRequest() {}

        public OAuthCallbackRequest(String code, String redirectUri, String codeVerifier) {
            this.code = code;
            this.redirectUri = redirectUri;
            this.codeVerifier = codeVerifier;
        }

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }

        public String getRedirectUri() {
            return redirectUri;
        }

        public void setRedirectUri(String redirectUri) {
            this.redirectUri = redirectUri;
        }

        public String getCodeVerifier() {
            return codeVerifier;
        }

        public void setCodeVerifier(String codeVerifier) {
            this.codeVerifier = codeVerifier;
        }
    }

    public static class OAuthCallbackResponse {
        private String message;
        private String sessionId;

        public OAuthCallbackResponse(String message, String sessionId) {
            this.message = message;
            this.sessionId = sessionId;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }
    }

    public static class SessionValidationResponse {
        private String message;
        private boolean valid;
        private String sessionId;

        public SessionValidationResponse(String message, boolean valid, String sessionId) {
            this.message = message;
            this.valid = valid;
            this.sessionId = sessionId;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public boolean isValid() {
            return valid;
        }

        public void setValid(boolean valid) {
            this.valid = valid;
        }

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }
    }

    public static class RefreshTokenResponse {
        private String message;
        private String accessToken;

        public RefreshTokenResponse(String message, String accessToken) {
            this.message = message;
            this.accessToken = accessToken;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public String getAccessToken() {
            return accessToken;
        }

        public void setAccessToken(String accessToken) {
            this.accessToken = accessToken;
        }
    }

    public static class ErrorResponse {
        private String error;

        public ErrorResponse(String error) {
            this.error = error;
        }

        public String getError() {
            return error;
        }

        public void setError(String error) {
            this.error = error;
        }
    }

    public static class SuccessResponse {
        private String message;

        public SuccessResponse(String message) {
            this.message = message;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }
    }

    public static class CodeVerifierRequest {
        private String codeVerifier;

        public String getCodeVerifier() {
            return codeVerifier;
        }

        public void setCodeVerifier(String codeVerifier) {
            this.codeVerifier = codeVerifier;
        }
    }

    public static class CodeVerifierTokenResponse {
        private String token;

        public CodeVerifierTokenResponse(String token) {
            this.token = token;
        }

        public String getToken() {
            return token;
        }

        public void setToken(String token) {
            this.token = token;
        }
    }

    public static class UserInfoResponse {
        private String userId;

        public UserInfoResponse(String userId) {
            this.userId = userId;
        }

        public String getUserId() {
            return userId;
        }

        public void setUserId(String userId) {
            this.userId = userId;
        }
    }
}