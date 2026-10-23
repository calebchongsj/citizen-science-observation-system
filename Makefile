# Firebase project configuration (required: make setup-all PROJECT=myproject APP_NAME=myapp)

define check_project
	@if [ -z "$(PROJECT)" ]; then \
		echo ""; \
		echo "========================================"; \
		echo "  ERROR: Missing required parameter"; \
		echo "========================================"; \
		echo ""; \
		echo "  PROJECT is required but was not provided."; \
		echo ""; \
		echo "  Usage:"; \
		echo "    make <task> PROJECT=<project-id>"; \
		echo ""; \
		echo "  Example:"; \
		echo "    make <task> PROJECT=my-firebase-project"; \
		echo ""; \
		echo "  Did you follow the setup guide?"; \
		echo "  $(SETUP_DOC_URL)"; \
		echo ""; \
		exit 1; \
	fi
endef

define check_project_and_app
	@if [ -z "$(PROJECT)" ] || [ -z "$(APP_NAME)" ]; then \
		echo ""; \
		echo "========================================"; \
		echo "  ERROR: Missing required parameters"; \
		echo "========================================"; \
		echo ""; \
		if [ -z "$(PROJECT)" ]; then echo "  ✗ PROJECT is required but was not provided."; else echo "  ✓ PROJECT=$(PROJECT)"; fi; \
		if [ -z "$(APP_NAME)" ]; then echo "  ✗ APP_NAME is required but was not provided."; else echo "  ✓ APP_NAME=$(APP_NAME)"; fi; \
		echo ""; \
		echo "  Usage:"; \
		echo "    make <task> PROJECT=<project-id> APP_NAME=<app-name>"; \
		echo ""; \
		echo "  Example:"; \
		echo "    make <task> PROJECT=my-firebase-project APP_NAME=my-web-app"; \
		echo ""; \
		echo "  Did you follow the setup guide?"; \
		echo "  $(SETUP_DOC_URL)"; \
		echo ""; \
		exit 1; \
	fi
endef

SETUP_DOC_URL := https://docs.google.com/document/d/1HxVM2J8SDZg8KkwlwWnVGyiYuarz6IhqiSVXtwJOz0I/edit?usp=sharing
define show_setup_doc
	@echo "Make sure to follow the setup guide: $(SETUP_DOC_URL)"
	@echo ""
endef

.PHONY: install build test test-integration test-all clean generate dev-backend dev-frontend typecheck lint \
	setup-all setup-firebase-cli setup-check-firebase setup-fe-sdk-config setup-firestore setup-storage setup-service-account setup-auth emulator deploy-indexes list-indexes

install:
	cd backend && npm install
	cd frontend && npm install
	npm install

generate:
	cd backend && npm run generate-spec
	cd frontend && npm run generate-api

typecheck:
	cd backend && npx tsc --noEmit
	cd frontend && npx tsc --noEmit

lint:
	cd backend && npm run lint
	cd frontend && npm run lint

build:
	cd backend && npm run build
	cd frontend && npm run build

test:
	cd backend && npm run test
	cd frontend && npm run test

test-integration:
	cd backend && (npm run emulator &>/dev/null & sleep 3 && npm run test:integration; kill $$! 2>/dev/null || true)

test-all: test test-integration

emulator:
	cd backend && firebase emulators:start

deploy-indexes:
	$(call check_project)
	cd backend && firebase deploy --only firestore:indexes --project $(PROJECT)

list-indexes:
	$(call check_project)
	firebase firestore:indexes --project $(PROJECT)

# Setup: Install Firebase CLI and login
setup-firebase-cli:
	$(call show_setup_doc)
	@echo "=== Installing Firebase CLI ==="
	npm install -g firebase-tools
	@echo ""
	@echo "=== Logging into Firebase ==="
	firebase login

# Setup: Verify Firebase project and app exist
setup-check-firebase: setup-firebase-cli
	$(call check_project_and_app)
	@echo "=== Checking Firebase project exists ==="
	@firebase projects:list --json | node -e " \
		const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); \
		const found = data.result?.some(p => p.projectId === '$(PROJECT)'); \
		if (!found) { console.error(\"ERROR: Project '$(PROJECT)' not found. Create it in Firebase Console first.\"); process.exit(1); }"
	@echo "=== Checking Firebase app exists ==="
	@APP_ID=$$(firebase apps:list WEB --project $(PROJECT) --json | node -e " \
		const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); \
		const app = data.result?.find(a => a.displayName === '$(APP_NAME)'); \
		if (app) console.log(app.appId); else process.exit(1);" 2>/dev/null) && \
	if [ -z "$$APP_ID" ]; then \
		echo "ERROR: App '$(APP_NAME)' not found in project '$(PROJECT)'. Create it in Firebase Console first."; \
		exit 1; \
	fi
	@echo "Project '$(PROJECT)' and app '$(APP_NAME)' verified."

# Setup: Fetch frontend SDK config and populate .env.local
setup-fe-sdk-config: setup-check-firebase
	$(call show_setup_doc)
	@echo "=== Fetching Frontend SDK Config ==="
	@APP_ID=$$(firebase apps:list WEB --project $(PROJECT) --json | node -e " \
		const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); \
		const app = data.result?.find(a => a.displayName === '$(APP_NAME)'); \
		if (app) console.log(app.appId);") && \
	firebase apps:sdkconfig WEB $$APP_ID --project $(PROJECT) --json | node -e " \
		const data = JSON.parse(require('fs').readFileSync(0, 'utf8')); \
		const cfg = data.result.sdkConfig; \
		console.log('# Firebase Web Config'); \
		console.log('VITE_FIREBASE_API_KEY=' + cfg.apiKey); \
		console.log('VITE_FIREBASE_AUTH_DOMAIN=' + cfg.authDomain); \
		console.log('VITE_FIREBASE_PROJECT_ID=' + cfg.projectId); \
		console.log('VITE_FIREBASE_APP_ID=' + cfg.appId); \
		if (cfg.storageBucket) console.log('VITE_FIREBASE_STORAGE_BUCKET=' + cfg.storageBucket);" > frontend/.env.local && \
	echo "Created frontend/.env.local with Firebase config"

# Setup: Print Firestore setup instructions
setup-firestore:
	$(call check_project)
	$(call show_setup_doc)
	@echo "========================================"
	@echo "  FIRESTORE SETUP"
	@echo "========================================"
	@echo ""
	@echo "1. Go to: https://console.firebase.google.com/project/$(PROJECT)/firestore"
	@echo "2. Click 'Create database'"
	@echo "3. Select 'Start in production mode'"
	@echo "4. Choose location: asia-southeast1 (Singapore)"
	@echo "5. Click 'Enable'"
	@echo ""

# Setup: Print Storage setup instructions
setup-storage:
	$(call check_project)
	$(call show_setup_doc)
	@echo "========================================"
	@echo "  FIREBASE STORAGE SETUP"
	@echo "========================================"
	@echo ""
	@echo "1. Go to: https://console.firebase.google.com/project/$(PROJECT)/storage"
	@echo "2. Click 'Get started'"
	@echo "3. Select 'No cost location' with US-CENTRAL1"
	@echo "4. Click 'Continue'"
	@echo "5. Select 'Start in production mode'"
	@echo "6. Click 'Done'"

# Setup: Print service account setup instructions
setup-service-account:
	$(call check_project)
	$(call show_setup_doc)
	@echo "========================================"
	@echo "  SERVICE ACCOUNT SETUP"
	@echo "========================================"
	@echo ""
	@echo "1. Go to: https://console.firebase.google.com/project/$(PROJECT)/settings/serviceaccounts/adminsdk"
	@echo "2. Click 'Generate new private key'"
	@echo "3. Save the file as: backend/svc-account-key.json"
	@echo ""
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo "Created backend/.env"; \
	else \
		echo "backend/.env already exists"; \
	fi

# Setup: Print authentication setup instructions
setup-auth:
	$(call check_project)
	$(call show_setup_doc)
	@echo "========================================"
	@echo "  AUTHENTICATION SETUP"
	@echo "========================================"
	@echo ""
	@echo "1. Go to: https://console.firebase.google.com/project/$(PROJECT)/authentication/providers"
	@echo "2. Click 'Get started' if first time"
	@echo "3. Enable desired sign-in providers (e.g., Google, Email/Password)"
	@echo ""
	@echo "For Google provider:"
	@echo "  - Click Google > Enable"
	@echo "  - Set project support email"
	@echo "  - Click Save"

# Setup: Run all setup steps
setup-all: setup-fe-sdk-config setup-firestore setup-storage setup-service-account setup-auth
	$(call show_setup_doc)
	@echo ""
	@echo "========================================"
	@echo "  Setup complete! Run 'make install' next."
	@echo "========================================"

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

clean:
	rm -rf backend/node_modules backend/dist
	rm -rf frontend/node_modules frontend/dist

