#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build SheetFlow AI — SaaS that converts Google Sheets links into secure department-wise APIs.
  MVP focus: paste sheet URL → parse structure → configure department/columns/filter → generate
  token-protected REST endpoint + Apps Script. JWT auth with MongoDB.

backend:
  - task: "Auth (signup/login/me) with JWT + bcrypt"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me. Returns JWT (30d). Bcrypt 10 rounds. Stores user in 'users' collection with UUID id."
      - working: true
        agent: "testing"
        comment: "✅ ALL AUTH TESTS PASSED: Signup returns 200 with JWT token and user object (id, email, name, role). Duplicate signup correctly returns 409. Login with valid credentials returns 200 with token. Login with wrong password returns 401. GET /auth/me with Bearer token returns 200 with user data. GET /auth/me without token returns 401. Email is properly lowercased. UUIDs used for user IDs."

  - task: "Google Sheet parsing via public gviz endpoint"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/sheets/parse {url}. Extracts sheetId+gid from URL, calls Google's gviz JSON endpoint, parses columns/types/preview. No OAuth needed - requires sheet shared as 'Anyone with the link can view'."
      - working: true
        agent: "testing"
        comment: "✅ SHEET PARSING WORKING: Successfully parsed Google Sheets (tested with fallback sheet 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms). Returns sheetId, gid, columns array with name/type, rowCount, and preview array. Invalid URLs correctly return 400 with clear error message. Column detection works properly including header row handling."

  - task: "Connector CRUD"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/connectors (list), POST /api/connectors (create with auto-generated 32-char hex token), GET /api/connectors/:id, DELETE /api/connectors/:id. All require auth, scoped by userId."
      - working: true
        agent: "testing"
        comment: "✅ CONNECTOR CRUD WORKING: POST /api/connectors creates connector with auto-generated 32-char hex token, returns full connector object with UUID id. GET /api/connectors lists all user's connectors. GET /api/connectors/:id retrieves specific connector. DELETE /api/connectors/:id removes connector and returns {ok:true}. All endpoints require Bearer token auth and are properly scoped by userId. Activity logging works for connector_created and connector_deleted events."

  - task: "Public secure API endpoint - the MAGIC"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/public/:token returns live JSON from Google Sheet: fetches gviz, applies column selection and filter, increments callCount, logs activity. Returns 401 for invalid token."
      - working: true
        agent: "testing"
        comment: "✅ PUBLIC API WORKING: GET /api/public/:token successfully fetches live data from Google Sheets, returns JSON with connector name, department, count, generated_at, and data array. Column filtering works (only selected columns returned). CallCount increments properly. Activity logging works (api_call events). Invalid tokens return 401 with 'Invalid or revoked API token'. After connector deletion, token correctly becomes invalid (401). No auth required for this endpoint - token-based access only."

  - task: "Apps Script generator + sync + stats + activity"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/connectors/:id/script returns Apps Script as text/plain. POST /api/connectors/:id/sync updates lastSyncAt. GET /api/stats returns aggregated KPIs. GET /api/activity returns last 100 activity events."
      - working: true
        agent: "testing"
        comment: "✅ ALL ENDPOINTS WORKING: GET /api/connectors/:id/script returns text/plain Apps Script code containing doGet function, connector token, SHEET_ID, and deployment instructions. POST /api/connectors/:id/sync returns 200 with lastSyncAt timestamp. GET /api/stats returns connectorsCount, totalCalls, activeCount, byDepartment object, and recentActivity array. GET /api/activity returns activity array with all events (signup, login, connector_created, api_call, connector_synced, connector_deleted). All require auth."

frontend:
  - task: "Landing + auth + dashboard + new-connector flow + connector detail (test console, Apps Script, config)"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Full SPA with route state. Visual screenshot confirms landing renders correctly with dark theme, gradient hero, code preview card, and 3-step section."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Initial MVP shipped. Please test the BACKEND only. Key flow to verify:
      1) POST /api/auth/signup creates user and returns JWT.
      2) POST /api/auth/login validates credentials.
      3) GET /api/auth/me with Bearer token returns user.
      4) POST /api/sheets/parse with a public Google Sheets URL returns columns/preview/rowCount.
         Sample URL that works: https://docs.google.com/spreadsheets/d/1zT-RFK8gZWLwjwDp_dxhdYLeKHGn--Ke0pQ7H5LP00g/edit?usp=sharing
         (If that's unavailable, use any sheet you create and share "Anyone with the link, Viewer").
      5) POST /api/connectors (authed) creates a connector with token.
      6) GET /api/public/{token} returns the JSON with filtered/selected columns. No auth required.
      7) GET /api/connectors/:id/script returns Apps Script code (text/plain).
      8) GET /api/stats returns KPIs.
      9) DELETE /api/connectors/:id removes connector and subsequent /api/public/{token} returns 401.
      All routes are in /app/app/api/[[...path]]/route.js. Base URL: use NEXT_PUBLIC_BASE_URL from /app/.env.
      MongoDB DB_NAME=sheetflow_ai, collections: users, connectors, activity. UUIDs only (no ObjectId leakage).
  - agent: "testing"
    message: |
      🎉 BACKEND TESTING COMPLETE - ALL TESTS PASSED (20/20 - 100%)
      
      Comprehensive test suite executed covering:
      ✅ Health check endpoint
      ✅ Complete auth flow (signup, duplicate prevention, login, wrong password handling, /me with/without token)
      ✅ Google Sheets parsing (valid URLs, invalid URLs, column detection, preview data)
      ✅ Full connector CRUD (create with token generation, list, get by ID, delete)
      ✅ Public API (valid token returns live data, invalid token returns 401, deleted connector token becomes invalid)
      ✅ Apps Script generation (proper text/plain format with doGet function)
      ✅ Sync endpoint (updates lastSyncAt)
      ✅ Stats endpoint (connectorsCount, totalCalls, byDepartment aggregation)
      ✅ Activity logging (all events tracked: signup, login, connector_created, api_call, connector_synced, connector_deleted)
      
      Key findings:
      - All endpoints return proper status codes (200, 400, 401, 404, 409, 500)
      - JWT authentication working correctly with 30-day expiration
      - UUIDs used throughout (no MongoDB ObjectId leakage)
      - Column filtering works in public API
      - Activity logging comprehensive
      - Error messages are clear and helpful
      - Token-based public access works without authentication
      
      Test file: /app/backend_test.py
      All backend tasks marked as working=true, needs_retesting=false.
