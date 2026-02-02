package com.bionicpro.auth.service;

import com.bionicpro.auth.model.SessionInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class SessionService {

    @Autowired
    private KeycloakService keycloakService;

    // In-memory storage for sessions
    private final ConcurrentHashMap<String, SessionInfo> sessionStorage = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> refreshTokenToSessionId = new ConcurrentHashMap<>();

    public String createSession(SessionInfo sessionInfo) {
        String sessionId = sessionInfo.getSessionId();

        // Store session info in memory
        sessionStorage.put(sessionId, sessionInfo);

        // Also store refresh token mapping
        refreshTokenToSessionId.put(sessionInfo.getRefreshToken(), sessionId);

        return sessionId;
    }

    public SessionInfo getSession(String sessionId) {
        return sessionStorage.get(sessionId);
    }

    public SessionInfo validateAndRefreshSession(String sessionId) throws Exception {
        SessionInfo sessionInfo = getSession(sessionId);

        if (sessionInfo == null) {
            throw new RuntimeException("Session not found");
        }

        if (sessionInfo.isSessionExpired()) {
            invalidateSession(sessionId);
            throw new RuntimeException("Session expired");
        }

        // Check if access token is expired and refresh if needed
        if (sessionInfo.isAccessTokenExpired()) {
            SessionInfo refreshedTokens = keycloakService.refreshAccessToken(sessionInfo.getRefreshToken());

            // Update session with new access token
            sessionInfo.setAccessToken(refreshedTokens.getAccessToken());
            sessionInfo.setAccessTokenExpiry(refreshedTokens.getAccessTokenExpiry());

            // Update in memory
            sessionStorage.put(sessionId, sessionInfo);
        }

        return sessionInfo;
    }

    public SessionInfo refreshAccessToken(String sessionId) throws Exception {
        SessionInfo sessionInfo = getSession(sessionId);

        if (sessionInfo == null) {
            throw new RuntimeException("Session not found");
        }

        // Refresh the access token using the refresh token
        SessionInfo refreshedTokens = keycloakService.refreshAccessToken(sessionInfo.getRefreshToken());

        // Update session with new access token
        sessionInfo.setAccessToken(refreshedTokens.getAccessToken());
        sessionInfo.setAccessTokenExpiry(refreshedTokens.getAccessTokenExpiry());

        // Update in memory
        sessionStorage.put(sessionId, sessionInfo);

        return sessionInfo;
    }

    public SessionInfo rotateSession(String currentSessionId) throws Exception {
        SessionInfo sessionInfo = validateAndRefreshSession(currentSessionId);

        if (sessionInfo == null) {
            return null;
        }

        // Invalidate old session
        invalidateSession(currentSessionId);

        // Create new session with same tokens but new ID
        String newSessionId = java.util.UUID.randomUUID().toString();
        SessionInfo newSessionInfo = new SessionInfo(
            newSessionId,
            sessionInfo.getAccessToken(),
            sessionInfo.getRefreshToken(),
            sessionInfo.getAccessTokenExpiry(),
            java.time.LocalDateTime.now().plusMinutes(30) // New expiry time
        );

        // Store new session in memory
        sessionStorage.put(newSessionId, newSessionInfo);

        // Update refresh token mapping
        refreshTokenToSessionId.put(newSessionInfo.getRefreshToken(), newSessionId);

        return newSessionInfo;
    }

    public void invalidateSession(String sessionId) {
        SessionInfo sessionInfo = getSession(sessionId);

        if (sessionInfo != null) {
            // Remove refresh token mapping as well
            refreshTokenToSessionId.remove(sessionInfo.getRefreshToken());
        }

        sessionStorage.remove(sessionId);
    }
}