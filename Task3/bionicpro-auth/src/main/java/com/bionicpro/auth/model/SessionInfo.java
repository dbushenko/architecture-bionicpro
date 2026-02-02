package com.bionicpro.auth.model;

import java.time.LocalDateTime;

public class SessionInfo {
    private String sessionId;
    private String accessToken;
    private String refreshToken;
    private LocalDateTime accessTokenExpiry;
    private LocalDateTime sessionExpiry;

    public SessionInfo() {}

    public SessionInfo(String sessionId, String accessToken, String refreshToken, LocalDateTime accessTokenExpiry, LocalDateTime sessionExpiry) {
        this.sessionId = sessionId;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.accessTokenExpiry = accessTokenExpiry;
        this.sessionExpiry = sessionExpiry;
    }

    // Getters and setters
    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public void setAccessToken(String accessToken) {
        this.accessToken = accessToken;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }

    public LocalDateTime getAccessTokenExpiry() {
        return accessTokenExpiry;
    }

    public void setAccessTokenExpiry(LocalDateTime accessTokenExpiry) {
        this.accessTokenExpiry = accessTokenExpiry;
    }

    public LocalDateTime getSessionExpiry() {
        return sessionExpiry;
    }

    public void setSessionExpiry(LocalDateTime sessionExpiry) {
        this.sessionExpiry = sessionExpiry;
    }

    public boolean isAccessTokenExpired() {
        return LocalDateTime.now().isAfter(accessTokenExpiry);
    }

    public boolean isSessionExpired() {
        return LocalDateTime.now().isAfter(sessionExpiry);
    }
}