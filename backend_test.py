#!/usr/bin/env python3
"""
Sheet2API AI Backend Test Suite
Tests rebrand + Google OAuth redirect building + legacy endpoints + full flow regression
"""
import requests
import json
import time
from urllib.parse import urlparse, parse_qs

# Base URL from .env
BASE_URL = "https://connector-flow-1.preview.emergentagent.com/api"
FRONTEND_URL = "https://connector-flow-1.preview.emergentagent.com"

# Test data
TEST_EMAIL = f"test_user_{int(time.time())}@example.com"
TEST_PASSWORD = "SecurePass123!"
TEST_NAME = "Test User"

# Global test state
test_token = None
test_user_id = None
test_source_id = None
test_connector_id = None
test_connector_token = None

def log_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   {details}")
    return passed

def test_health_rebrand():
    """Test 1: Health endpoint should return service='Sheet2API AI'"""
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        data = r.json()
        passed = r.status_code == 200 and data.get("service") == "Sheet2API AI"
        return log_test("Health endpoint rebrand", passed, 
                       f"service={data.get('service')}, status={data.get('status')}")
    except Exception as e:
        return log_test("Health endpoint rebrand", False, str(e))

def test_google_oauth_start_login():
    """Test 2a: GET /api/auth/google/start → 307 redirect with proper params"""
    try:
        r = requests.get(f"{BASE_URL}/auth/google/start", allow_redirects=False, timeout=10)
        
        if r.status_code != 307:
            return log_test("Google OAuth start (login)", False, 
                           f"Expected 307, got {r.status_code}")
        
        redirect_url = r.headers.get("Location", "")
        if not redirect_url.startswith("https://accounts.google.com/o/oauth2/v2/auth"):
            return log_test("Google OAuth start (login)", False, 
                           f"Redirect URL doesn't start with Google OAuth URL: {redirect_url[:100]}")
        
        # Parse query params
        parsed = urlparse(redirect_url)
        params = parse_qs(parsed.query)
        
        # Check required params
        checks = {
            "client_id": params.get("client_id", [""])[0].startswith("29382725463-"),
            "redirect_uri": params.get("redirect_uri", [""])[0] == f"{FRONTEND_URL}/api/auth/google/callback",
            "response_type": params.get("response_type", [""])[0] == "code",
            "access_type": params.get("access_type", [""])[0] == "offline",
            "prompt": params.get("prompt", [""])[0] == "consent",
            "state": len(params.get("state", [""])[0]) > 0,
        }
        
        # Check scopes
        scope = params.get("scope", [""])[0]
        required_scopes = ["openid", "email", "profile", "spreadsheets.readonly", "drive.metadata.readonly"]
        scope_checks = all(s in scope for s in required_scopes)
        
        # Check state format (should end with ::login)
        state = params.get("state", [""])[0]
        state_format_ok = state.endswith("::login")
        
        all_passed = all(checks.values()) and scope_checks and state_format_ok
        
        details = f"client_id={checks['client_id']}, redirect_uri={checks['redirect_uri']}, " \
                 f"response_type={checks['response_type']}, scopes={scope_checks}, " \
                 f"access_type={checks['access_type']}, prompt={checks['prompt']}, " \
                 f"state_format={state_format_ok}"
        
        return log_test("Google OAuth start (login)", all_passed, details)
    except Exception as e:
        return log_test("Google OAuth start (login)", False, str(e))

def test_google_oauth_start_link():
    """Test 2b: GET /api/auth/google/start?link_token=JWT → state ends with ::link"""
    global test_token
    if not test_token:
        return log_test("Google OAuth start (link)", False, "No test token available")
    
    try:
        r = requests.get(f"{BASE_URL}/auth/google/start?link_token={test_token}", 
                        allow_redirects=False, timeout=10)
        
        if r.status_code != 307:
            return log_test("Google OAuth start (link)", False, 
                           f"Expected 307, got {r.status_code}")
        
        redirect_url = r.headers.get("Location", "")
        parsed = urlparse(redirect_url)
        params = parse_qs(parsed.query)
        state = params.get("state", [""])[0]
        
        passed = state.endswith("::link")
        return log_test("Google OAuth start (link)", passed, 
                       f"state ends with ::link = {passed}")
    except Exception as e:
        return log_test("Google OAuth start (link)", False, str(e))

def test_google_oauth_callback_error():
    """Test 2c: GET /api/auth/google/callback?error=access_denied → redirect with google_error"""
    try:
        r = requests.get(f"{BASE_URL}/auth/google/callback?error=access_denied", 
                        allow_redirects=False, timeout=10)
        
        if r.status_code != 307:
            return log_test("Google OAuth callback (error)", False, 
                           f"Expected 307, got {r.status_code}")
        
        redirect_url = r.headers.get("Location", "")
        passed = "google_error=access_denied" in redirect_url
        return log_test("Google OAuth callback (error)", passed, 
                       f"Redirects to frontend with google_error param")
    except Exception as e:
        return log_test("Google OAuth callback (error)", False, str(e))

def test_google_oauth_callback_no_code():
    """Test 2d: GET /api/auth/google/callback (no params) → redirect with google_error=missing_code"""
    try:
        r = requests.get(f"{BASE_URL}/auth/google/callback", 
                        allow_redirects=False, timeout=10)
        
        if r.status_code != 307:
            return log_test("Google OAuth callback (no code)", False, 
                           f"Expected 307, got {r.status_code}")
        
        redirect_url = r.headers.get("Location", "")
        passed = "google_error=missing_code" in redirect_url
        return log_test("Google OAuth callback (no code)", passed, 
                       f"Redirects with google_error=missing_code")
    except Exception as e:
        return log_test("Google OAuth callback (no code)", False, str(e))

def test_google_oauth_callback_invalid_state():
    """Test 2e: GET /api/auth/google/callback?state=nonexistent&code=fake → google_error=invalid_state"""
    try:
        r = requests.get(f"{BASE_URL}/auth/google/callback?state=nonexistent&code=fake", 
                        allow_redirects=False, timeout=10)
        
        if r.status_code != 307:
            return log_test("Google OAuth callback (invalid state)", False, 
                           f"Expected 307, got {r.status_code}")
        
        redirect_url = r.headers.get("Location", "")
        passed = "google_error=invalid_state" in redirect_url
        return log_test("Google OAuth callback (invalid state)", passed, 
                       f"Redirects with google_error=invalid_state")
    except Exception as e:
        return log_test("Google OAuth callback (invalid state)", False, str(e))

def test_google_status_no_auth():
    """Test 3a: GET /api/auth/google/status (no Bearer) → 401"""
    try:
        r = requests.get(f"{BASE_URL}/auth/google/status", timeout=10)
        passed = r.status_code == 401
        return log_test("Google status (no auth)", passed, 
                       f"status={r.status_code}")
    except Exception as e:
        return log_test("Google status (no auth)", False, str(e))

def test_google_status_fresh_user():
    """Test 3b: GET /api/auth/google/status (Bearer of fresh user) → 200 {connected:false}"""
    global test_token
    if not test_token:
        return log_test("Google status (fresh user)", False, "No test token available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        r = requests.get(f"{BASE_URL}/auth/google/status", headers=headers, timeout=10)
        
        if r.status_code != 200:
            return log_test("Google status (fresh user)", False, 
                           f"Expected 200, got {r.status_code}")
        
        data = r.json()
        passed = data.get("connected") == False and data.get("googleId") is None
        return log_test("Google status (fresh user)", passed, 
                       f"connected={data.get('connected')}, googleId={data.get('googleId')}")
    except Exception as e:
        return log_test("Google status (fresh user)", False, str(e))

def test_google_disconnect():
    """Test 3c: POST /api/auth/google/disconnect (Bearer) → 200 {ok:true}"""
    global test_token
    if not test_token:
        return log_test("Google disconnect", False, "No test token available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        r = requests.post(f"{BASE_URL}/auth/google/disconnect", headers=headers, timeout=10)
        
        if r.status_code != 200:
            return log_test("Google disconnect", False, 
                           f"Expected 200, got {r.status_code}")
        
        data = r.json()
        passed = data.get("ok") == True
        return log_test("Google disconnect", passed, 
                       f"ok={data.get('ok')}")
    except Exception as e:
        return log_test("Google disconnect", False, str(e))

def test_google_sheets_no_connection():
    """Test 3d: GET /api/google/sheets (Bearer, no Google tokens) → 400 with error"""
    global test_token
    if not test_token:
        return log_test("Google sheets (no connection)", False, "No test token available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        r = requests.get(f"{BASE_URL}/google/sheets", headers=headers, timeout=10)
        
        passed = r.status_code == 400
        data = r.json() if r.status_code == 400 else {}
        error_msg = data.get("error", "")
        has_reconnect_msg = "not connected" in error_msg.lower() or "re-authorize" in error_msg.lower()
        
        return log_test("Google sheets (no connection)", passed and has_reconnect_msg, 
                       f"status={r.status_code}, error mentions reconnect={has_reconnect_msg}")
    except Exception as e:
        return log_test("Google sheets (no connection)", False, str(e))

def test_google_sheets_meta_no_connection():
    """Test 3e: GET /api/google/sheets/some-id/meta (Bearer, no Google) → 400"""
    global test_token
    if not test_token:
        return log_test("Google sheets meta (no connection)", False, "No test token available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        r = requests.get(f"{BASE_URL}/google/sheets/fake-sheet-id/meta", headers=headers, timeout=10)
        
        passed = r.status_code == 400
        return log_test("Google sheets meta (no connection)", passed, 
                       f"status={r.status_code}")
    except Exception as e:
        return log_test("Google sheets meta (no connection)", False, str(e))

def test_legacy_signup():
    """Test 4a: POST /api/auth/signup → 200 {token, user}"""
    global test_token, test_user_id
    try:
        payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}
        r = requests.post(f"{BASE_URL}/auth/signup", json=payload, timeout=10)
        
        if r.status_code != 200:
            return log_test("Legacy signup", False, 
                           f"Expected 200, got {r.status_code}: {r.text}")
        
        data = r.json()
        test_token = data.get("token")
        test_user_id = data.get("user", {}).get("id")
        
        passed = test_token and test_user_id and data.get("user", {}).get("email") == TEST_EMAIL.lower()
        return log_test("Legacy signup", passed, 
                       f"token={bool(test_token)}, user.id={bool(test_user_id)}")
    except Exception as e:
        return log_test("Legacy signup", False, str(e))

def test_legacy_login():
    """Test 4b: POST /api/auth/login → 200 {token, user}"""
    try:
        payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        r = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        
        if r.status_code != 200:
            return log_test("Legacy login", False, 
                           f"Expected 200, got {r.status_code}")
        
        data = r.json()
        passed = data.get("token") and data.get("user", {}).get("email") == TEST_EMAIL.lower()
        return log_test("Legacy login", passed, 
                       f"token={bool(data.get('token'))}")
    except Exception as e:
        return log_test("Legacy login", False, str(e))

def test_legacy_forgot():
    """Test 4c: POST /api/auth/forgot → 200 {resetUrl}"""
    try:
        payload = {"email": TEST_EMAIL}
        r = requests.post(f"{BASE_URL}/auth/forgot", json=payload, timeout=10)
        
        if r.status_code != 200:
            return log_test("Legacy forgot password", False, 
                           f"Expected 200, got {r.status_code}")
        
        data = r.json()
        reset_url = data.get("resetUrl")
        passed = reset_url and "reset=" in reset_url
        return log_test("Legacy forgot password", passed, 
                       f"resetUrl present={bool(reset_url)}")
    except Exception as e:
        return log_test("Legacy forgot password", False, str(e))

def test_legacy_reset():
    """Test 4d: POST /api/auth/reset → 200, old password fails, new works"""
    try:
        # Get reset token
        payload = {"email": TEST_EMAIL}
        r = requests.post(f"{BASE_URL}/auth/forgot", json=payload, timeout=10)
        data = r.json()
        reset_url = data.get("resetUrl", "")
        
        # Extract token from URL
        reset_token = reset_url.split("reset=")[-1] if "reset=" in reset_url else None
        if not reset_token:
            return log_test("Legacy reset password", False, "No reset token in resetUrl")
        
        # Reset password
        new_password = "NewSecurePass456!"
        payload = {"token": reset_token, "password": new_password}
        r = requests.post(f"{BASE_URL}/auth/reset", json=payload, timeout=10)
        
        if r.status_code != 200:
            return log_test("Legacy reset password", False, 
                           f"Reset failed: {r.status_code}")
        
        # Try old password (should fail)
        payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        r_old = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        old_fails = r_old.status_code == 401
        
        # Try new password (should work)
        payload = {"email": TEST_EMAIL, "password": new_password}
        r_new = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        new_works = r_new.status_code == 200
        
        passed = old_fails and new_works
        return log_test("Legacy reset password", passed, 
                       f"old_password_fails={old_fails}, new_password_works={new_works}")
    except Exception as e:
        return log_test("Legacy reset password", False, str(e))

def test_full_flow_sources():
    """Test 5a: POST /api/sources (csv_upload) → 200"""
    global test_token, test_source_id
    if not test_token:
        return log_test("Full flow - sources", False, "No test token available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        payload = {
            "type": "csv_upload",
            "name": "Test CSV Source",
            "fileName": "test.csv",
            "columns": [
                {"id": "col0", "name": "id", "type": "string"},
                {"id": "col1", "name": "name", "type": "string"},
                {"id": "col2", "name": "dept", "type": "string"}
            ],
            "rows": [
                ["1", "Alice", "Engineering"],
                ["2", "Bob", "Finance"],
                ["3", "Charlie", "Engineering"]
            ]
        }
        r = requests.post(f"{BASE_URL}/sources", json=payload, headers=headers, timeout=10)
        
        if r.status_code != 200:
            return log_test("Full flow - sources", False, 
                           f"Expected 200, got {r.status_code}: {r.text}")
        
        data = r.json()
        test_source_id = data.get("source", {}).get("id")
        passed = test_source_id is not None
        return log_test("Full flow - sources", passed, 
                       f"source.id={test_source_id}")
    except Exception as e:
        return log_test("Full flow - sources", False, str(e))

def test_full_flow_connectors():
    """Test 5b: POST /api/connectors → 200 with token"""
    global test_token, test_source_id, test_connector_id, test_connector_token
    if not test_token or not test_source_id:
        return log_test("Full flow - connectors", False, "No test token or source_id available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        payload = {
            "sourceId": test_source_id,
            "name": "Test Connector",
            "department": "Engineering",
            "columns": ["id", "name", "dept"],
            "filter": {"column": "dept", "operator": "equals", "value": "Engineering"}
        }
        r = requests.post(f"{BASE_URL}/connectors", json=payload, headers=headers, timeout=10)
        
        if r.status_code != 200:
            return log_test("Full flow - connectors", False, 
                           f"Expected 200, got {r.status_code}: {r.text}")
        
        data = r.json()
        test_connector_id = data.get("connector", {}).get("id")
        test_connector_token = data.get("connector", {}).get("token")
        
        passed = test_connector_id and test_connector_token and len(test_connector_token) == 32
        return log_test("Full flow - connectors", passed, 
                       f"connector.id={test_connector_id}, token_length={len(test_connector_token) if test_connector_token else 0}")
    except Exception as e:
        return log_test("Full flow - connectors", False, str(e))

def test_full_flow_public_api():
    """Test 5c: GET /api/public/{token} → 200 with data + count + total"""
    global test_connector_token
    if not test_connector_token:
        return log_test("Full flow - public API", False, "No connector token available")
    
    try:
        r = requests.get(f"{BASE_URL}/public/{test_connector_token}", timeout=10)
        
        if r.status_code != 200:
            return log_test("Full flow - public API", False, 
                           f"Expected 200, got {r.status_code}: {r.text}")
        
        data = r.json()
        has_data = "data" in data and isinstance(data["data"], list)
        has_count = "count" in data
        has_total = "total" in data
        
        # Should have 2 Engineering records (Alice and Charlie)
        correct_filter = data.get("count") == 2
        
        passed = has_data and has_count and has_total and correct_filter
        return log_test("Full flow - public API", passed, 
                       f"data={has_data}, count={data.get('count')}, total={data.get('total')}")
    except Exception as e:
        return log_test("Full flow - public API", False, str(e))

def test_full_flow_mcp():
    """Test 5d: GET /api/connectors/{id}/mcp → 200 with @modelcontextprotocol/sdk"""
    global test_token, test_connector_id
    if not test_token or not test_connector_id:
        return log_test("Full flow - MCP generator", False, "No test token or connector_id available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        r = requests.get(f"{BASE_URL}/connectors/{test_connector_id}/mcp", headers=headers, timeout=10)
        
        if r.status_code != 200:
            return log_test("Full flow - MCP generator", False, 
                           f"Expected 200, got {r.status_code}")
        
        content = r.text
        has_sdk = "@modelcontextprotocol/sdk" in content
        is_text = r.headers.get("Content-Type", "").startswith("text/plain")
        
        passed = has_sdk and is_text
        return log_test("Full flow - MCP generator", passed, 
                       f"has_sdk={has_sdk}, content_type=text/plain")
    except Exception as e:
        return log_test("Full flow - MCP generator", False, str(e))

def test_full_flow_openapi():
    """Test 5e: GET /api/connectors/{id}/openapi → 200 with openapi:3.1.0"""
    global test_token, test_connector_id
    if not test_token or not test_connector_id:
        return log_test("Full flow - OpenAPI generator", False, "No test token or connector_id available")
    
    try:
        headers = {"Authorization": f"Bearer {test_token}"}
        r = requests.get(f"{BASE_URL}/connectors/{test_connector_id}/openapi", headers=headers, timeout=10)
        
        if r.status_code != 200:
            return log_test("Full flow - OpenAPI generator", False, 
                           f"Expected 200, got {r.status_code}")
        
        data = r.json()
        passed = data.get("openapi") == "3.1.0" and "paths" in data
        return log_test("Full flow - OpenAPI generator", passed, 
                       f"openapi={data.get('openapi')}, has_paths={'paths' in data}")
    except Exception as e:
        return log_test("Full flow - OpenAPI generator", False, str(e))

def run_all_tests():
    """Run all backend tests in sequence"""
    print("\n" + "="*80)
    print("Sheet2API AI Backend Test Suite - Rebrand + Google OAuth + Regression")
    print("="*80 + "\n")
    
    results = []
    
    # Test 1: Rebrand
    print("\n--- TEST 1: REBRAND VERIFICATION ---")
    results.append(test_health_rebrand())
    
    # Test 2: Google OAuth redirect building (no actual OAuth dance)
    print("\n--- TEST 2: GOOGLE OAUTH REDIRECT BUILDING ---")
    results.append(test_google_oauth_callback_error())
    results.append(test_google_oauth_callback_no_code())
    results.append(test_google_oauth_callback_invalid_state())
    
    # Test 4: Legacy endpoints (need to run before OAuth tests that need token)
    print("\n--- TEST 4: LEGACY ENDPOINTS ---")
    results.append(test_legacy_signup())
    results.append(test_legacy_login())
    results.append(test_legacy_forgot())
    results.append(test_legacy_reset())
    
    # Test 2 continued: OAuth start (needs token for link test)
    print("\n--- TEST 2 (continued): GOOGLE OAUTH START ---")
    results.append(test_google_oauth_start_login())
    results.append(test_google_oauth_start_link())
    
    # Test 3: Google status/disconnect
    print("\n--- TEST 3: GOOGLE STATUS/DISCONNECT ---")
    results.append(test_google_status_no_auth())
    results.append(test_google_status_fresh_user())
    results.append(test_google_disconnect())
    results.append(test_google_sheets_no_connection())
    results.append(test_google_sheets_meta_no_connection())
    
    # Test 5: Full flow regression
    print("\n--- TEST 5: FULL FLOW REGRESSION ---")
    results.append(test_full_flow_sources())
    results.append(test_full_flow_connectors())
    results.append(test_full_flow_public_api())
    results.append(test_full_flow_mcp())
    results.append(test_full_flow_openapi())
    
    # Summary
    print("\n" + "="*80)
    passed = sum(results)
    total = len(results)
    print(f"SUMMARY: {passed}/{total} tests passed ({100*passed//total}%)")
    print("="*80 + "\n")
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
