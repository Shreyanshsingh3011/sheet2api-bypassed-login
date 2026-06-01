#!/usr/bin/env python3
"""
SheetFlow AI - Comprehensive Backend Test Suite (Batch 1)
Tests all endpoints with new architecture: Sources, Connectors, Public API with query params, caching, masking, governance
"""
import requests
import json
import time
import random
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://connector-flow-1.preview.emergentagent.com/api"

# Test state
state = {
    'email': f'test+{random.randint(10000,99999)}@sf.ai',
    'password': 'Pass1234',
    'new_password': 'NewPass1',
    'name': 'Test User',
    'token': None,
    'user_id': None,
    'csv_source_id': None,
    'gs_source_id': None,
    'connector_id': None,
    'connector_token': None,
    'new_connector_token': None,
    'reset_token': None
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_result(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    log(f"{status}: {name}")
    if details:
        log(f"  → {details}")
    return passed

# ═══════════════════════════════════════════════════════════════════════════════
# 1. HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════
def test_health():
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        return test_result("Health check", r.status_code == 200, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Health check", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 2. AUTH FLOW
# ═══════════════════════════════════════════════════════════════════════════════
def test_auth_signup():
    try:
        r = requests.post(f"{BASE_URL}/auth/signup", json={
            'email': state['email'],
            'password': state['password'],
            'name': state['name']
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'token' in data and 'user' in data:
                state['token'] = data['token']
                state['user_id'] = data['user']['id']
                return test_result("Auth signup", True, f"Token received, user_id: {state['user_id']}")
        return test_result("Auth signup", False, f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return test_result("Auth signup", False, str(e))

def test_auth_duplicate_signup():
    try:
        r = requests.post(f"{BASE_URL}/auth/signup", json={
            'email': state['email'],
            'password': state['password'],
            'name': state['name']
        }, timeout=10)
        return test_result("Auth duplicate signup prevention", r.status_code == 409, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Auth duplicate signup prevention", False, str(e))

def test_auth_login():
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            'email': state['email'],
            'password': state['password']
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return test_result("Auth login", 'token' in data, "Login successful")
        return test_result("Auth login", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Auth login", False, str(e))

def test_auth_wrong_password():
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            'email': state['email'],
            'password': 'WrongPassword123'
        }, timeout=10)
        return test_result("Auth wrong password", r.status_code == 401, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Auth wrong password", False, str(e))

def test_auth_me_with_token():
    try:
        r = requests.get(f"{BASE_URL}/auth/me", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return test_result("Auth /me with token", 'user' in data, f"User: {data.get('user', {}).get('email')}")
        return test_result("Auth /me with token", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Auth /me with token", False, str(e))

def test_auth_me_without_token():
    try:
        r = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        return test_result("Auth /me without token", r.status_code == 401, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Auth /me without token", False, str(e))

def test_auth_forgot():
    try:
        r = requests.post(f"{BASE_URL}/auth/forgot", json={
            'email': state['email']
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'resetUrl' in data and data['resetUrl']:
                # Extract token from URL: ...?reset=TOKEN
                reset_url = data['resetUrl']
                if '?reset=' in reset_url:
                    state['reset_token'] = reset_url.split('?reset=')[1]
                    return test_result("Auth forgot password", True, f"Reset token: {state['reset_token'][:16]}...")
        return test_result("Auth forgot password", False, f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return test_result("Auth forgot password", False, str(e))

def test_auth_reset():
    try:
        if not state['reset_token']:
            return test_result("Auth reset password", False, "No reset token available")
        r = requests.post(f"{BASE_URL}/auth/reset", json={
            'token': state['reset_token'],
            'password': state['new_password']
        }, timeout=10)
        if r.status_code == 200:
            return test_result("Auth reset password", True, "Password reset successful")
        return test_result("Auth reset password", False, f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return test_result("Auth reset password", False, str(e))

def test_auth_old_password_fails():
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            'email': state['email'],
            'password': state['password']  # old password
        }, timeout=10)
        return test_result("Auth old password fails after reset", r.status_code == 401, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Auth old password fails after reset", False, str(e))

def test_auth_new_password_works():
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={
            'email': state['email'],
            'password': state['new_password']  # new password
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'token' in data:
                state['token'] = data['token']  # Update token for rest of tests
                return test_result("Auth new password works", True, "Login with new password successful")
        return test_result("Auth new password works", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Auth new password works", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 3. SOURCES
# ═══════════════════════════════════════════════════════════════════════════════
def test_sources_csv_upload():
    try:
        r = requests.post(f"{BASE_URL}/sources", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'type': 'csv_upload',
            'name': 'Employees CSV',
            'fileName': 'emp.csv',
            'columns': [
                {'id': 'col0', 'name': 'id', 'type': 'string'},
                {'id': 'col1', 'name': 'name', 'type': 'string'},
                {'id': 'col2', 'name': 'email', 'type': 'string'},
                {'id': 'col3', 'name': 'salary', 'type': 'number'},
                {'id': 'col4', 'name': 'dept', 'type': 'string'}
            ],
            'rows': [
                ['1', 'Alice', 'alice@acme.com', 90000, 'Engineering'],
                ['2', 'Bob', 'bob@acme.com', 85000, 'Finance'],
                ['3', 'Carol', 'carol@acme.com', 95000, 'Engineering'],
                ['4', 'Dan', 'dan@acme.com', 75000, 'HR'],
                ['5', 'Eve', 'eve@acme.com', 100000, 'Finance']
            ]
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'source' in data and 'id' in data['source']:
                state['csv_source_id'] = data['source']['id']
                return test_result("Sources CSV upload", True, f"Source ID: {state['csv_source_id']}")
        return test_result("Sources CSV upload", False, f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return test_result("Sources CSV upload", False, str(e))

def test_sources_google_sheet():
    try:
        r = requests.post(f"{BASE_URL}/sources", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'type': 'google_sheet',
            'name': 'GS Demo',
            'url': 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'
        }, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if 'source' in data and 'id' in data['source']:
                state['gs_source_id'] = data['source']['id']
                return test_result("Sources Google Sheet", True, f"Source ID: {state['gs_source_id']}")
        return test_result("Sources Google Sheet", False, f"Status {r.status_code}: {r.text[:300]}")
    except Exception as e:
        return test_result("Sources Google Sheet", False, str(e))

def test_sources_list():
    try:
        r = requests.get(f"{BASE_URL}/sources", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            sources = data.get('sources', [])
            count = len(sources)
            return test_result("Sources list", count >= 1, f"Found {count} source(s)")
        return test_result("Sources list", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Sources list", False, str(e))

def test_sources_get_by_id():
    try:
        if not state['csv_source_id']:
            return test_result("Sources get by ID", False, "No CSV source ID available")
        r = requests.get(f"{BASE_URL}/sources/{state['csv_source_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            has_source = 'source' in data
            has_preview = 'preview' in data and len(data['preview']) > 0
            return test_result("Sources get by ID", has_source and has_preview, 
                             f"Source returned with {len(data.get('preview', []))} preview rows")
        return test_result("Sources get by ID", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Sources get by ID", False, str(e))

def test_sources_invalid_gs_url():
    try:
        r = requests.post(f"{BASE_URL}/sources", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'type': 'google_sheet',
            'name': 'Invalid GS',
            'url': 'https://invalid-url.com/not-a-sheet'
        }, timeout=10)
        return test_result("Sources invalid GS URL", r.status_code == 400, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Sources invalid GS URL", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 4. CONNECTORS
# ═══════════════════════════════════════════════════════════════════════════════
def test_connectors_create():
    try:
        if not state['csv_source_id']:
            return test_result("Connectors create", False, "No CSV source ID available")
        r = requests.post(f"{BASE_URL}/connectors", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'sourceId': state['csv_source_id'],
            'name': 'Finance Team',
            'department': 'Finance',
            'columns': ['id', 'name', 'email', 'salary', 'dept'],
            'maskedColumns': ['email', 'salary'],
            'filter': {'column': 'dept', 'operator': 'equals', 'value': 'Finance'},
            'cacheMode': 'live',
            'cacheTTLSeconds': 300
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'connector' in data and 'token' in data['connector']:
                state['connector_id'] = data['connector']['id']
                state['connector_token'] = data['connector']['token']
                return test_result("Connectors create", True, 
                                 f"Connector ID: {state['connector_id']}, Token: {state['connector_token'][:16]}...")
        return test_result("Connectors create", False, f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return test_result("Connectors create", False, str(e))

def test_connectors_list():
    try:
        r = requests.get(f"{BASE_URL}/connectors", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            connectors = data.get('connectors', [])
            has_our_connector = any(c['id'] == state['connector_id'] for c in connectors)
            return test_result("Connectors list", has_our_connector, f"Found {len(connectors)} connector(s)")
        return test_result("Connectors list", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Connectors list", False, str(e))

def test_connectors_get_by_id():
    try:
        if not state['connector_id']:
            return test_result("Connectors get by ID", False, "No connector ID available")
        r = requests.get(f"{BASE_URL}/connectors/{state['connector_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return test_result("Connectors get by ID", 'connector' in data, "Connector retrieved")
        return test_result("Connectors get by ID", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Connectors get by ID", False, str(e))

def test_connectors_patch():
    try:
        if not state['connector_id']:
            return test_result("Connectors PATCH", False, "No connector ID available")
        r = requests.patch(f"{BASE_URL}/connectors/{state['connector_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'name': 'Finance Team v2'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            updated_name = data.get('connector', {}).get('name')
            return test_result("Connectors PATCH", updated_name == 'Finance Team v2', f"Name updated to: {updated_name}")
        return test_result("Connectors PATCH", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Connectors PATCH", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 5. PUBLIC API (THE MAGIC)
# ═══════════════════════════════════════════════════════════════════════════════
def test_public_api_basic():
    try:
        if not state['connector_token']:
            return test_result("Public API basic", False, "No connector token available")
        r = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        if r.status_code == 200:
            data = r.json()
            # Should have only Finance dept rows (Bob + Eve = 2)
            count = data.get('count', 0)
            has_data = 'data' in data and len(data['data']) > 0
            from_cache = data.get('fromCache', None)
            # Check masking: email and salary should be masked
            if has_data:
                first_row = data['data'][0]
                email_masked = 'email' in first_row and '***' in str(first_row['email'])
                salary_masked = 'salary' in first_row and '***' in str(first_row['salary'])
                masking_works = email_masked and salary_masked
                return test_result("Public API basic", count == 2 and masking_works, 
                                 f"Count: {count}, fromCache: {from_cache}, Masking: {masking_works}")
            return test_result("Public API basic", False, "No data returned")
        return test_result("Public API basic", False, f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return test_result("Public API basic", False, str(e))

def test_public_api_limit():
    try:
        if not state['connector_token']:
            return test_result("Public API limit", False, "No connector token available")
        r = requests.get(f"{BASE_URL}/public/{state['connector_token']}?limit=1", timeout=10)
        if r.status_code == 200:
            data = r.json()
            count = data.get('count', 0)
            total = data.get('total', 0)
            return test_result("Public API limit", count == 1 and total == 2, 
                             f"Count: {count}, Total: {total}")
        return test_result("Public API limit", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Public API limit", False, str(e))

def test_public_api_sort():
    try:
        if not state['connector_token']:
            return test_result("Public API sort", False, "No connector token available")
        r = requests.get(f"{BASE_URL}/public/{state['connector_token']}?sort=-name", timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'data' in data and len(data['data']) > 0:
                first_name = data['data'][0].get('name', '')
                # With -name (desc), Eve should come before Bob
                return test_result("Public API sort", first_name == 'Eve', f"First name: {first_name}")
        return test_result("Public API sort", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Public API sort", False, str(e))

def test_public_api_fields():
    try:
        if not state['connector_token']:
            return test_result("Public API fields", False, "No connector token available")
        r = requests.get(f"{BASE_URL}/public/{state['connector_token']}?fields=id,name", timeout=10)
        if r.status_code == 200:
            data = r.json()
            if 'data' in data and len(data['data']) > 0:
                first_row = data['data'][0]
                keys = set(first_row.keys())
                # Should only have id and name
                expected = {'id', 'name'}
                return test_result("Public API fields", keys == expected, f"Keys: {keys}")
        return test_result("Public API fields", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Public API fields", False, str(e))

def test_public_api_search():
    try:
        if not state['connector_token']:
            return test_result("Public API search", False, "No connector token available")
        r = requests.get(f"{BASE_URL}/public/{state['connector_token']}?q=eve", timeout=10)
        if r.status_code == 200:
            data = r.json()
            count = data.get('count', 0)
            if count > 0 and 'data' in data:
                first_name = data['data'][0].get('name', '')
                return test_result("Public API search", first_name == 'Eve', f"Found: {first_name}")
        return test_result("Public API search", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Public API search", False, str(e))

def test_public_api_cache_mode():
    try:
        if not state['connector_id']:
            return test_result("Public API cache mode", False, "No connector ID available")
        # Switch to cached mode
        r = requests.patch(f"{BASE_URL}/connectors/{state['connector_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'cacheMode': 'cached',
            'cacheTTLSeconds': 60
        }, timeout=10)
        if r.status_code != 200:
            return test_result("Public API cache mode", False, f"Failed to update cache mode: {r.status_code}")
        
        # First call - should be fromCache: false
        r1 = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        if r1.status_code != 200:
            return test_result("Public API cache mode", False, f"First call failed: {r1.status_code}")
        data1 = r1.json()
        from_cache_1 = data1.get('fromCache', None)
        
        # Second call immediately - should be fromCache: true
        time.sleep(0.5)
        r2 = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        if r2.status_code != 200:
            return test_result("Public API cache mode", False, f"Second call failed: {r2.status_code}")
        data2 = r2.json()
        from_cache_2 = data2.get('fromCache', None)
        
        return test_result("Public API cache mode", 
                         from_cache_1 == False and from_cache_2 == True,
                         f"First: {from_cache_1}, Second: {from_cache_2}")
    except Exception as e:
        return test_result("Public API cache mode", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 6. GOVERNANCE
# ═══════════════════════════════════════════════════════════════════════════════
def test_governance_rotate_token():
    try:
        if not state['connector_id']:
            return test_result("Governance rotate token", False, "No connector ID available")
        old_token = state['connector_token']
        
        # Rotate token
        r = requests.post(f"{BASE_URL}/connectors/{state['connector_id']}/rotate-token", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code != 200:
            return test_result("Governance rotate token", False, f"Rotate failed: {r.status_code}")
        
        data = r.json()
        new_token = data.get('connector', {}).get('token')
        if not new_token or new_token == old_token:
            return test_result("Governance rotate token", False, "Token not changed")
        
        state['new_connector_token'] = new_token
        
        # Old token should fail
        r_old = requests.get(f"{BASE_URL}/public/{old_token}", timeout=10)
        old_fails = r_old.status_code == 401
        
        # New token should work
        r_new = requests.get(f"{BASE_URL}/public/{new_token}", timeout=10)
        new_works = r_new.status_code == 200
        
        # Update state for remaining tests
        state['connector_token'] = new_token
        
        return test_result("Governance rotate token", old_fails and new_works,
                         f"Old token: {r_old.status_code}, New token: {r_new.status_code}")
    except Exception as e:
        return test_result("Governance rotate token", False, str(e))

def test_governance_revoke():
    try:
        if not state['connector_id']:
            return test_result("Governance revoke", False, "No connector ID available")
        
        # Revoke
        r = requests.post(f"{BASE_URL}/connectors/{state['connector_id']}/revoke", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code != 200:
            return test_result("Governance revoke", False, f"Revoke failed: {r.status_code}")
        
        # Token should now return 401
        r_pub = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        return test_result("Governance revoke", r_pub.status_code == 401,
                         f"Public API status after revoke: {r_pub.status_code}")
    except Exception as e:
        return test_result("Governance revoke", False, str(e))

def test_governance_unrevoke():
    try:
        if not state['connector_id']:
            return test_result("Governance unrevoke", False, "No connector ID available")
        
        # Unrevoke
        r = requests.post(f"{BASE_URL}/connectors/{state['connector_id']}/unrevoke", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code != 200:
            return test_result("Governance unrevoke", False, f"Unrevoke failed: {r.status_code}")
        
        # Token should work again
        r_pub = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        return test_result("Governance unrevoke", r_pub.status_code == 200,
                         f"Public API status after unrevoke: {r_pub.status_code}")
    except Exception as e:
        return test_result("Governance unrevoke", False, str(e))

def test_governance_expiry():
    try:
        if not state['connector_id']:
            return test_result("Governance expiry", False, "No connector ID available")
        
        # Set expiry to past date
        past_date = (datetime.now() - timedelta(days=1)).isoformat() + 'Z'
        r = requests.patch(f"{BASE_URL}/connectors/{state['connector_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'expiresAt': past_date
        }, timeout=10)
        if r.status_code != 200:
            return test_result("Governance expiry", False, f"Failed to set expiry: {r.status_code}")
        
        # Token should return 401
        r_pub = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        expired_fails = r_pub.status_code == 401
        
        # Restore (set to null)
        r_restore = requests.patch(f"{BASE_URL}/connectors/{state['connector_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, json={
            'expiresAt': None
        }, timeout=10)
        if r_restore.status_code != 200:
            return test_result("Governance expiry", False, f"Failed to restore: {r_restore.status_code}")
        
        # Token should work again
        r_pub2 = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        restored_works = r_pub2.status_code == 200
        
        return test_result("Governance expiry", expired_fails and restored_works,
                         f"Expired: {r_pub.status_code}, Restored: {r_pub2.status_code}")
    except Exception as e:
        return test_result("Governance expiry", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 7. GENERATORS
# ═══════════════════════════════════════════════════════════════════════════════
def test_generators_script():
    try:
        if not state['connector_id']:
            return test_result("Generators Apps Script", False, "No connector ID available")
        r = requests.get(f"{BASE_URL}/connectors/{state['connector_id']}/script", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            content = r.text
            has_doget = 'doGet' in content
            has_token = state['connector_token'] in content
            return test_result("Generators Apps Script", has_doget and has_token,
                             f"Content length: {len(content)}, has doGet: {has_doget}, has token: {has_token}")
        return test_result("Generators Apps Script", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Generators Apps Script", False, str(e))

def test_generators_mcp():
    try:
        if not state['connector_id']:
            return test_result("Generators MCP", False, "No connector ID available")
        r = requests.get(f"{BASE_URL}/connectors/{state['connector_id']}/mcp", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            content = r.text
            has_sdk = '@modelcontextprotocol/sdk' in content
            return test_result("Generators MCP", has_sdk,
                             f"Content length: {len(content)}, has SDK import: {has_sdk}")
        return test_result("Generators MCP", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Generators MCP", False, str(e))

def test_generators_openapi():
    try:
        if not state['connector_id']:
            return test_result("Generators OpenAPI", False, "No connector ID available")
        r = requests.get(f"{BASE_URL}/connectors/{state['connector_id']}/openapi", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            has_openapi = data.get('openapi') == '3.1.0'
            has_paths = 'paths' in data and len(data['paths']) > 0
            return test_result("Generators OpenAPI", has_openapi and has_paths,
                             f"OpenAPI version: {data.get('openapi')}, Paths: {len(data.get('paths', {}))}")
        return test_result("Generators OpenAPI", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Generators OpenAPI", False, str(e))

def test_generators_audit():
    try:
        if not state['connector_id']:
            return test_result("Generators audit", False, "No connector ID available")
        r = requests.get(f"{BASE_URL}/connectors/{state['connector_id']}/audit", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            audit = data.get('audit', [])
            has_api_calls = any(a.get('action') == 'api_call' for a in audit)
            return test_result("Generators audit", len(audit) > 0,
                             f"Audit entries: {len(audit)}, has api_call: {has_api_calls}")
        return test_result("Generators audit", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Generators audit", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 8. STATS
# ═══════════════════════════════════════════════════════════════════════════════
def test_stats():
    try:
        r = requests.get(f"{BASE_URL}/stats", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code == 200:
            data = r.json()
            has_connectors = 'connectorsCount' in data and data['connectorsCount'] >= 1
            has_sources = 'sourcesCount' in data and data['sourcesCount'] >= 1
            has_calls = 'totalCalls' in data and data['totalCalls'] >= 1
            has_active = 'activeCount' in data
            has_dept = 'byDepartment' in data
            has_timeseries = 'timeseries' in data and len(data['timeseries']) == 14
            has_calls_dept = 'callsByDept' in data
            has_recent = 'recentActivity' in data
            
            all_fields = has_connectors and has_sources and has_calls and has_active and has_dept and has_timeseries and has_calls_dept and has_recent
            return test_result("Stats endpoint", all_fields,
                             f"Connectors: {data.get('connectorsCount')}, Sources: {data.get('sourcesCount')}, Calls: {data.get('totalCalls')}, Timeseries: {len(data.get('timeseries', []))}")
        return test_result("Stats endpoint", False, f"Status {r.status_code}")
    except Exception as e:
        return test_result("Stats endpoint", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# 9. CLEANUP
# ═══════════════════════════════════════════════════════════════════════════════
def test_cleanup_connector():
    try:
        if not state['connector_id']:
            return test_result("Cleanup connector", False, "No connector ID available")
        r = requests.delete(f"{BASE_URL}/connectors/{state['connector_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        if r.status_code != 200:
            return test_result("Cleanup connector", False, f"Delete failed: {r.status_code}")
        
        # Token should now return 401
        r_pub = requests.get(f"{BASE_URL}/public/{state['connector_token']}", timeout=10)
        return test_result("Cleanup connector", r_pub.status_code == 401,
                         f"Public API after delete: {r_pub.status_code}")
    except Exception as e:
        return test_result("Cleanup connector", False, str(e))

def test_cleanup_source():
    try:
        if not state['csv_source_id']:
            return test_result("Cleanup source", False, "No CSV source ID available")
        r = requests.delete(f"{BASE_URL}/sources/{state['csv_source_id']}", headers={
            'Authorization': f'Bearer {state["token"]}'
        }, timeout=10)
        return test_result("Cleanup source", r.status_code == 200, f"Status: {r.status_code}")
    except Exception as e:
        return test_result("Cleanup source", False, str(e))

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TEST RUNNER
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    log("=" * 80)
    log("SheetFlow AI - Comprehensive Backend Test Suite (Batch 1)")
    log("=" * 80)
    
    results = []
    
    # 1. Health
    log("\n[1] HEALTH CHECK")
    results.append(test_health())
    
    # 2. Auth
    log("\n[2] AUTH FLOW")
    results.append(test_auth_signup())
    results.append(test_auth_duplicate_signup())
    results.append(test_auth_login())
    results.append(test_auth_wrong_password())
    results.append(test_auth_me_with_token())
    results.append(test_auth_me_without_token())
    results.append(test_auth_forgot())
    results.append(test_auth_reset())
    results.append(test_auth_old_password_fails())
    results.append(test_auth_new_password_works())
    
    # 3. Sources
    log("\n[3] SOURCES")
    results.append(test_sources_csv_upload())
    results.append(test_sources_google_sheet())
    results.append(test_sources_list())
    results.append(test_sources_get_by_id())
    results.append(test_sources_invalid_gs_url())
    
    # 4. Connectors
    log("\n[4] CONNECTORS")
    results.append(test_connectors_create())
    results.append(test_connectors_list())
    results.append(test_connectors_get_by_id())
    results.append(test_connectors_patch())
    
    # 5. Public API
    log("\n[5] PUBLIC API (THE MAGIC)")
    results.append(test_public_api_basic())
    results.append(test_public_api_limit())
    results.append(test_public_api_sort())
    results.append(test_public_api_fields())
    results.append(test_public_api_search())
    results.append(test_public_api_cache_mode())
    
    # 6. Governance
    log("\n[6] GOVERNANCE")
    results.append(test_governance_rotate_token())
    results.append(test_governance_revoke())
    results.append(test_governance_unrevoke())
    results.append(test_governance_expiry())
    
    # 7. Generators
    log("\n[7] GENERATORS")
    results.append(test_generators_script())
    results.append(test_generators_mcp())
    results.append(test_generators_openapi())
    results.append(test_generators_audit())
    
    # 8. Stats
    log("\n[8] STATS")
    results.append(test_stats())
    
    # 9. Cleanup
    log("\n[9] CLEANUP")
    results.append(test_cleanup_connector())
    results.append(test_cleanup_source())
    
    # Summary
    log("\n" + "=" * 80)
    passed = sum(results)
    total = len(results)
    percentage = (passed / total * 100) if total > 0 else 0
    log(f"FINAL RESULTS: {passed}/{total} tests passed ({percentage:.1f}%)")
    log("=" * 80)
    
    return passed == total

if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
