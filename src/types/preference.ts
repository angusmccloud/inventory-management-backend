/**
 * Theme preference types for backend
 * Feature: 012-theme-toggle
 */

/** Theme preference values */
export type ThemePreference = 'light' | 'dark' | 'auto';

/** User entity with theme preference */
export interface UserEntity {
  PK: string;              // USER#<userId>
  SK: string;              // USER#<userId>
  email: string;
  role: 'admin' | 'suggester';
  familyId: string;
  themePreference?: ThemePreference;
  createdAt: string;
  updatedAt: string;
}

/** Theme preference API request body */
export interface UpdateThemeRequest {
  theme: ThemePreference;
}

/** Theme preference API response */
export interface ThemePreferenceResponse {
  data: {
    theme: ThemePreference;
  };
}
