import { getCredentials } from "../reporting/env";
import { GoogleAdsRestClient } from "./rest-client";

export function googleAdsClient(credentials = getCredentials()) {
  return new GoogleAdsRestClient({
    clientId: credentials.googleClientId, clientSecret: credentials.googleClientSecret,
    refreshToken: credentials.googleRefreshToken, apiVersion: credentials.googleAdsApiVersion,
    project: { id: process.env.GOOGLE_ADS_CLOUD_PROJECT_ID, number: process.env.GOOGLE_ADS_CLOUD_PROJECT_NUMBER,
      name: process.env.GOOGLE_ADS_CLOUD_PROJECT_NAME, accessLevel: process.env.GOOGLE_ADS_PROJECT_ACCESS_LEVEL },
  });
}
