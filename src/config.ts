// Where the push Worker lives and its VAPID public key (safe to publish: it
// only identifies this app to the push service; the private half is a Worker
// secret). Regenerate both with server/scripts/gen-vapid.mjs.
export const PUSH_API = 'https://lunch-push.machina-infastructure.workers.dev';
export const VAPID_PUBLIC_KEY = 'BHbXEUG7TKn6wit4xg2Uj3P1g5s6auOis4yxz2FDrBktzbb4-ClV-BDOsyb0fcgwCvbbm5xxkP9kjZnNUlL5lmA';
