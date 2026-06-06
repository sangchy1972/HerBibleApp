// Dynamic Expo config.
//
// app.json remains the single source of truth for everything. This file exists
// only so the Android google-services.json can stay OUT of the git repo:
//   • Locally / dev-client: the file is on disk (git-ignored) and app.json's
//     "googleServicesFile": "./google-services.json" is used as-is.
//   • On EAS: the file is provided as a "file"-type env var named
//     GOOGLE_SERVICES_JSON; EAS writes it to a temp path and sets that path in
//     process.env.GOOGLE_SERVICES_JSON, which we inject below.
//
// Expo passes the resolved app.json config in as `config`, so nothing else
// needs to change — we only override the one field when the env var is present.
module.exports = ({ config }) => {
  const googleServicesPath = process.env.GOOGLE_SERVICES_JSON;
  if (googleServicesPath) {
    config.android = config.android || {};
    config.android.googleServicesFile = googleServicesPath;
  }
  return config;
};
