import { OpenAPI } from '../api';
import { auth } from './firebase';

/**
 * Configure the API client at startup.
 * - BASE: Use VITE_API_URL if set; otherwise in dev use '' so Vite proxy is used.
 * - TOKEN: Include Firebase auth token in all requests.
 */
export function configureApiAuth() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl !== undefined && apiUrl !== '') {
    OpenAPI.BASE = apiUrl;
  } else if (import.meta.env.DEV) {
    OpenAPI.BASE = '';
  }

  OpenAPI.TOKEN = async () => {
    const user = auth.currentUser;
    if (user) {
      return await user.getIdToken();
    }
    return '';
  };
}
