import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".agents/skills/google-ads-search-term-review-agent/scripts"))
from google_ads_pull import GoogleAdsRestClient


class GoogleClientTests(unittest.TestCase):
    @patch.dict(os.environ, {"GOOGLE_ADS_LOGIN_CUSTOMER_ID": "1112223333"})
    def test_direct_access_is_attempted_after_configured_manager(self):
        reader = object.__new__(GoogleAdsRestClient)
        seen = []
        def search(login, query):
            seen.append(login)
            if login:
                raise RuntimeError("fixture manager denied")
            return [{"customer": {"descriptiveName": "Direct account"}}]
        with patch.object(reader, "search_all", side_effect=search):
            self.assertEqual(reader.resolve_access(), (None, "Direct account"))
        self.assertEqual(seen, ["1112223333", None])

    @patch.dict(os.environ, {"GOOGLE_ADS_CLIENT_ID": "fixture", "GOOGLE_ADS_CLIENT_SECRET": "fixture", "GOOGLE_ADS_REFRESH_TOKEN": "fixture", "GOOGLE_ADS_API_VERSION": "v25"})
    @patch("google.oauth2.credentials.Credentials.refresh")
    def test_official_client_accepts_oauth_only_v25(self, refresh):
        reader = GoogleAdsRestClient("123-456-7890")
        direct = reader._client(None)
        self.assertEqual(direct.get_type("SearchGoogleAdsRequest", version="v25").__class__.__name__, "SearchGoogleAdsRequest")
        self.assertIsNone(direct.login_customer_id)
        self.assertEqual(reader._client("111-222-3333").login_customer_id, "1112223333")
        self.assertIs(reader._client(None), direct)

    def test_pagination_deduplicates_rows_and_stops_loops(self):
        reader = object.__new__(GoogleAdsRestClient)
        with patch.object(reader, "search_page", side_effect=[{"results": [{"id": "1"}], "nextPageToken": "next"}, {"results": [{"id": "1"}, {"id": "2"}]}]):
            self.assertEqual(reader.search_all(None, "query"), [{"id": "1"}, {"id": "2"}])
        with patch.object(reader, "search_page", return_value={"nextPageToken": "loop"}):
            with self.assertRaisesRegex(RuntimeError, "pagination"):
                reader.search_all(None, "query")


if __name__ == "__main__":
    unittest.main()
