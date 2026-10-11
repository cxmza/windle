import type { RouteObject } from 'react-router';
import { SignIn } from './SignIn';

// Placeholder route table: SIWS sign-in at /. Returns to `?return_to=` (allow-listed by safeReturnTo).
export const routes: RouteObject[] = [{ path: '/', element: <SignIn /> }];
