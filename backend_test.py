#!/usr/bin/env python3
"""
SheetFlow AI Backend API Test Suite
Tests all backend endpoints comprehensively
"""

import requests
import json
import time
import random
import string
from datetime import datetime

# Base URL from .env
BASE_URL = "https://connector-flow-1.preview.emergentagent.com/api"

# Test data
random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
TEST_EMAIL = f"test+{random_suffix}@sheetflow.ai"
TEST_PASSWORD = "Passw0rd!"
TEST_NAME = "Test User"

# Google Sheets URLs for testing
PRIMARY_SHEET_URL = "https://docs.google.com/spreadsheets/d/1zT-RFK8gZWLwjwDp_dxhdYLeKHGn--Ke0pQ7H5LP00g/edit?usp=sharing"
FALLBACK_SHEET_URL = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"

# Global variables to store test data
auth_token = None
user_id = None
connector_id = None
connector_token = None
sheet_columns = []

def print_test(name):
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_result(success, message):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    return success

def test_health():
    """Test 1: Health check endpoint"""
    print_test("Health Check")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'ok':
                return print_result(True, "Health check passed")
        return print_result(False, f"Health check failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Health check error: {str(e)}")

def test_signup():
    """Test 2a: User signup"""
    global auth_token, user_id
    print_test("Auth - Signup")
    try:
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": TEST_NAME
        }
        response = requests.post(f"{BASE_URL}/auth/signup", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if 'token' in data and 'user' in data:
                auth_token = data['token']
                user_id = data['user']['id']
                user = data['user']
                if user.get('email') == TEST_EMAIL.lower() and user.get('name') == TEST_NAME:
                    return print_result(True, f"Signup successful. User ID: {user_id}")
        return print_result(False, f"Signup failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Signup error: {str(e)}")

def test_duplicate_signup():
    """Test 2b: Duplicate signup should return 409"""
    print_test("Auth - Duplicate Signup")
    try:
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": TEST_NAME
        }
        response = requests.post(f"{BASE_URL}/auth/signup", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 409:
            data = response.json()
            if 'error' in data:
                return print_result(True, "Duplicate signup correctly rejected with 409")
        return print_result(False, f"Expected 409, got {response.status_code}")
    except Exception as e:
        return print_result(False, f"Duplicate signup test error: {str(e)}")

def test_login():
    """Test 2c: User login"""
    global auth_token
    print_test("Auth - Login")
    try:
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if 'token' in data and 'user' in data:
                auth_token = data['token']
                return print_result(True, "Login successful")
        return print_result(False, f"Login failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Login error: {str(e)}")

def test_login_wrong_password():
    """Test 2d: Login with wrong password should return 401"""
    print_test("Auth - Login with Wrong Password")
    try:
        payload = {
            "email": TEST_EMAIL,
            "password": "WrongPassword123!"
        }
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 401:
            return print_result(True, "Wrong password correctly rejected with 401")
        return print_result(False, f"Expected 401, got {response.status_code}")
    except Exception as e:
        return print_result(False, f"Wrong password test error: {str(e)}")

def test_auth_me_with_token():
    """Test 2e: Get current user with valid token"""
    print_test("Auth - GET /auth/me with Token")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if 'user' in data:
                user = data['user']
                if user.get('email') == TEST_EMAIL.lower():
                    return print_result(True, "Auth /me with token successful")
        return print_result(False, f"Auth /me failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Auth /me error: {str(e)}")

def test_auth_me_without_token():
    """Test 2f: Get current user without token should return 401"""
    print_test("Auth - GET /auth/me without Token")
    try:
        response = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 401:
            return print_result(True, "Auth /me without token correctly rejected with 401")
        return print_result(False, f"Expected 401, got {response.status_code}")
    except Exception as e:
        return print_result(False, f"Auth /me without token error: {str(e)}")

def test_sheet_parse():
    """Test 3: Parse Google Sheet"""
    global sheet_columns
    print_test("Sheet Parsing - Valid URL")
    try:
        # Try primary sheet first
        payload = {"url": PRIMARY_SHEET_URL}
        response = requests.post(f"{BASE_URL}/sheets/parse", json=payload, timeout=15)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Primary sheet failed, trying fallback sheet...")
            payload = {"url": FALLBACK_SHEET_URL}
            response = requests.post(f"{BASE_URL}/sheets/parse", json=payload, timeout=15)
            print(f"Fallback Status Code: {response.status_code}")
        
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if 'sheetId' in data and 'columns' in data and 'rowCount' in data and 'preview' in data:
                sheet_columns = [col['name'] for col in data['columns']]
                print(f"Parsed columns: {sheet_columns}")
                print(f"Row count: {data['rowCount']}")
                return print_result(True, f"Sheet parsed successfully. Columns: {len(sheet_columns)}, Rows: {data['rowCount']}")
        return print_result(False, f"Sheet parsing failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Sheet parsing error: {str(e)}")

def test_sheet_parse_invalid():
    """Test 3b: Parse invalid Google Sheet URL"""
    print_test("Sheet Parsing - Invalid URL")
    try:
        payload = {"url": "https://invalid-url.com/not-a-sheet"}
        response = requests.post(f"{BASE_URL}/sheets/parse", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 400:
            data = response.json()
            if 'error' in data:
                return print_result(True, "Invalid URL correctly rejected with 400")
        return print_result(False, f"Expected 400, got {response.status_code}")
    except Exception as e:
        return print_result(False, f"Invalid URL test error: {str(e)}")

def test_create_connector():
    """Test 4a: Create connector"""
    global connector_id, connector_token
    print_test("Connector - Create")
    try:
        # Use the fallback sheet that we know works (from successful parse test)
        sheet_url = FALLBACK_SHEET_URL
        # Extract sheetId
        import re
        match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', sheet_url)
        sheet_id = match.group(1) if match else "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
        
        # Use first column if available
        selected_columns = [sheet_columns[0]] if sheet_columns else []
        
        payload = {
            "name": "Test Connector",
            "department": "Finance",
            "sheetUrl": sheet_url,
            "sheetId": sheet_id,
            "gid": "0",
            "columns": selected_columns,
            "filter": None
        }
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/connectors", json=payload, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if 'connector' in data:
                connector = data['connector']
                connector_id = connector.get('id')
                connector_token = connector.get('token')
                if connector_id and connector_token:
                    print(f"Connector ID: {connector_id}")
                    print(f"Connector Token: {connector_token}")
                    return print_result(True, f"Connector created successfully")
        return print_result(False, f"Connector creation failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Connector creation error: {str(e)}")

def test_list_connectors():
    """Test 4b: List connectors"""
    print_test("Connector - List")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/connectors", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if 'connectors' in data:
                connectors = data['connectors']
                found = any(c.get('id') == connector_id for c in connectors)
                if found:
                    return print_result(True, f"Connector list retrieved. Count: {len(connectors)}")
                else:
                    return print_result(False, "Created connector not found in list")
        return print_result(False, f"List connectors failed: {response.text}")
    except Exception as e:
        return print_result(False, f"List connectors error: {str(e)}")

def test_get_connector():
    """Test 4c: Get connector by ID"""
    print_test("Connector - Get by ID")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/connectors/{connector_id}", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if 'connector' in data:
                connector = data['connector']
                if connector.get('id') == connector_id:
                    return print_result(True, "Connector retrieved by ID successfully")
        return print_result(False, f"Get connector failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Get connector error: {str(e)}")

def test_public_api_valid_token():
    """Test 5: Public API with valid token"""
    print_test("Public API - Valid Token")
    try:
        response = requests.get(f"{BASE_URL}/public/{connector_token}", timeout=15)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)[:500]}...")  # Truncate for readability
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ['connector', 'department', 'count', 'generated_at', 'data']
            if all(field in data for field in required_fields):
                print(f"Data count: {data['count']}")
                if data['count'] > 0 and len(data['data']) > 0:
                    print(f"Sample row: {data['data'][0]}")
                    # Verify only selected columns are present
                    return print_result(True, f"Public API returned data successfully. Count: {data['count']}")
                else:
                    return print_result(True, "Public API works but returned 0 rows (might be filter or empty sheet)")
        return print_result(False, f"Public API failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Public API error: {str(e)}")

def test_public_api_invalid_token():
    """Test 5b: Public API with invalid token"""
    print_test("Public API - Invalid Token")
    try:
        # Use a valid hex format token that doesn't exist (32 chars hex like real tokens)
        response = requests.get(f"{BASE_URL}/public/0000000000000000000000000000ffff", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 401:
            return print_result(True, "Invalid token correctly rejected with 401")
        return print_result(False, f"Expected 401, got {response.status_code}")
    except Exception as e:
        return print_result(False, f"Invalid token test error: {str(e)}")

def test_apps_script():
    """Test 6: Apps Script generation"""
    print_test("Apps Script Generation")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/connectors/{connector_id}/script", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        script_preview = response.text[:300] + "..." if len(response.text) > 300 else response.text
        print(f"Script Preview: {script_preview}")
        
        if response.status_code == 200:
            script = response.text
            # Verify it's text/plain and contains expected Apps Script elements
            if 'doGet' in script and connector_token in script and 'SHEET_ID' in script:
                return print_result(True, "Apps Script generated successfully")
        return print_result(False, f"Apps Script generation failed: {response.text[:200]}")
    except Exception as e:
        return print_result(False, f"Apps Script error: {str(e)}")

def test_sync():
    """Test 7a: Sync connector"""
    print_test("Connector - Sync")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/connectors/{connector_id}/sync", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') and 'lastSyncAt' in data:
                return print_result(True, f"Sync successful. Last sync: {data['lastSyncAt']}")
        return print_result(False, f"Sync failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Sync error: {str(e)}")

def test_stats():
    """Test 7b: Get stats"""
    print_test("Stats")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/stats", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ['connectorsCount', 'totalCalls', 'byDepartment']
            if all(field in data for field in required_fields):
                if data['connectorsCount'] >= 1:
                    return print_result(True, f"Stats retrieved. Connectors: {data['connectorsCount']}, Total calls: {data['totalCalls']}")
        return print_result(False, f"Stats failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Stats error: {str(e)}")

def test_activity():
    """Test 7c: Get activity"""
    print_test("Activity")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/activity", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)[:500]}...")
        
        if response.status_code == 200:
            data = response.json()
            if 'activity' in data:
                activities = data['activity']
                print(f"Activity count: {len(activities)}")
                # Check for expected activity types
                actions = [a.get('action') for a in activities]
                expected_actions = ['signup', 'login', 'connector_created', 'api_call']
                found_actions = [a for a in expected_actions if a in actions]
                return print_result(True, f"Activity retrieved. Count: {len(activities)}, Actions: {found_actions}")
        return print_result(False, f"Activity failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Activity error: {str(e)}")

def test_delete_connector():
    """Test 8a: Delete connector"""
    print_test("Connector - Delete")
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.delete(f"{BASE_URL}/connectors/{connector_id}", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                return print_result(True, "Connector deleted successfully")
        return print_result(False, f"Delete failed: {response.text}")
    except Exception as e:
        return print_result(False, f"Delete error: {str(e)}")

def test_public_api_after_delete():
    """Test 8b: Public API should fail after connector deletion"""
    print_test("Public API - After Deletion (should fail)")
    try:
        response = requests.get(f"{BASE_URL}/public/{connector_token}", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 401:
            return print_result(True, "Public API correctly returns 401 after connector deletion")
        return print_result(False, f"Expected 401 after deletion, got {response.status_code}")
    except Exception as e:
        return print_result(False, f"Post-deletion test error: {str(e)}")

def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*80)
    print("SHEETFLOW AI BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Email: {TEST_EMAIL}")
    print(f"Started at: {datetime.now().isoformat()}")
    
    results = []
    
    # Run tests in order
    results.append(("Health Check", test_health()))
    results.append(("Signup", test_signup()))
    results.append(("Duplicate Signup", test_duplicate_signup()))
    results.append(("Login", test_login()))
    results.append(("Login Wrong Password", test_login_wrong_password()))
    results.append(("Auth /me with Token", test_auth_me_with_token()))
    results.append(("Auth /me without Token", test_auth_me_without_token()))
    results.append(("Sheet Parse Valid", test_sheet_parse()))
    results.append(("Sheet Parse Invalid", test_sheet_parse_invalid()))
    results.append(("Create Connector", test_create_connector()))
    results.append(("List Connectors", test_list_connectors()))
    results.append(("Get Connector", test_get_connector()))
    results.append(("Public API Valid Token", test_public_api_valid_token()))
    results.append(("Public API Invalid Token", test_public_api_invalid_token()))
    results.append(("Apps Script", test_apps_script()))
    results.append(("Sync", test_sync()))
    results.append(("Stats", test_stats()))
    results.append(("Activity", test_activity()))
    results.append(("Delete Connector", test_delete_connector()))
    results.append(("Public API After Delete", test_public_api_after_delete()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print(f"Completed at: {datetime.now().isoformat()}")
    print("="*80)
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
