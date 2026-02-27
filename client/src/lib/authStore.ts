// Client-side auth store for password-based demo login
// Stores userId temporarily during MFA flow

let pendingMfaUserId: number | null = null;
let demoUser: { id: number; email: string | null; name: string | null; role: string } | null = null;

export function setPendingMfaUserId(id: number) {
  pendingMfaUserId = id;
}

export function getPendingMfaUserId() {
  return pendingMfaUserId;
}

export function clearPendingMfaUserId() {
  pendingMfaUserId = null;
}

export function setDemoUser(user: typeof demoUser) {
  demoUser = user;
  if (user) {
    sessionStorage.setItem("demo_user", JSON.stringify(user));
  } else {
    sessionStorage.removeItem("demo_user");
  }
}

export function getDemoUser() {
  if (demoUser) return demoUser;
  const stored = sessionStorage.getItem("demo_user");
  if (stored) {
    try {
      demoUser = JSON.parse(stored);
      return demoUser;
    } catch {
      return null;
    }
  }
  return null;
}

export function clearDemoUser() {
  demoUser = null;
  sessionStorage.removeItem("demo_user");
}
