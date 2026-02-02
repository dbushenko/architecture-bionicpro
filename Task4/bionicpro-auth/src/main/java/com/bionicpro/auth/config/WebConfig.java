package com.bionicpro.auth.config;

import com.bionicpro.auth.interceptor.SessionRotationInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private SessionRotationInterceptor sessionRotationInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(sessionRotationInterceptor)
                .addPathPatterns("/api/**"); // Apply to API endpoints
    }
}