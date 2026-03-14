# TOP 5 FUTURE REGRESSION RISKS

*Based on stabilization audit findings - March 14, 2026*

## 🔥 RISK #1: APPLE SIGN-IN LOGIC DRIFT (CRITICAL)

**Current State**: welcome.tsx has 200+ lines of duplicated Apple auth implementation

**Risk Factor**: 🔴 EXTREME
- **Complexity**: 200+ lines of authentication logic
- **Frequency**: Modified during auth flow changes
- **Impact**: Complete Apple Sign-In failure for signup flow

**Drift Scenarios**:
- Backend API changes → login.tsx updated, welcome.tsx forgotten
- Error handling improvements → applied to shared impl, not welcome.tsx
- Session bootstrap changes → welcome.tsx uses old bootstrap logic
- Security fixes → patched in shared auth, welcome.tsx vulnerable

**Prevention**:
```typescript
// IMMEDIATE: Replace welcome.tsx Apple function with:
await handleSharedAppleSignIn({
  isAppleSignInReady,
  setIsLoading,
  setErrorBanner,
  setDisplayName,
  onSuccess: () => setCurrentSlide(3),
});
```

**Detection**:
- Runtime assertion: `assertAppleAuthSSoT('welcome')`
- Build-time check: Lint rule prohibiting `AppleAuthentication.signInAsync` outside shared impl

---

## ⚠️ RISK #2: EMAIL VERIFICATION FLOW DUPLICATION (HIGH)

**Current State**: Email verification logic appears in 19 files

**Risk Factor**: 🟠 HIGH
- **Complexity**: Multi-step verification flows with retry/resend logic
- **Frequency**: Modified during onboarding UX improvements
- **Impact**: Broken email verification, auth flow failures

**Drift Scenarios**:
- Verification cooldown changes → different timeouts across screens
- Error message updates → inconsistent user messaging
- Backend API changes → verification submission endpoints drift
- Rate limiting logic → different retry behaviors

**Audit Findings**:
- `welcome.tsx`: Has verification email sending logic
- `LoginWithEmailPassword.tsx`: Has verification resend logic
- `verify-email.tsx`: Dedicated verification screen
- **+16 other files** with verification references

**Prevention**:
- Extract shared `emailVerificationFlow.ts` utility
- Centralize cooldown, retry, and submission logic
- Single error message mapping

---

## ⚠️ RISK #3: AUTH STATE CHECKING INCONSISTENCY (MEDIUM)

**Current State**: Multiple auth checking patterns coexist

**Risk Factor**: 🟡 MEDIUM
- **Complexity**: Multiple valid patterns for different use cases
- **Frequency**: Modified when adding new authenticated features
- **Impact**: Auth loops, permission bypasses, network storms

**Current Patterns**:
```typescript
// ✅ GOOD - Using SSOT
enabled: isAuthedForNetwork(bootStatus, session)

// ⚠️ RISKY - Direct checks (found 0 instances)
enabled: session?.user?.id && bootStatus === 'authed'

// ⚠️ RISKY - Partial checks
enabled: !!session?.user
```

**Drift Scenarios**:
- New developer uses direct session checks instead of gate
- Copy-paste from old code that doesn't use SSOT gate
- Different auth requirements → custom auth checks proliferate

**Prevention**:
- ESLint rule: Require `isAuthedForNetwork` for React Query `enabled`
- Code review checklist: Verify auth gate usage
- Runtime detection: Log auth checks not using SSOT

---

## ⚠️ RISK #4: POST-AUTH ROUTING DIVERGENCE (MEDIUM → LOW)

**Current State**: ✅ FIXED - Now using shared `authRouting.ts`

**Risk Factor**: 🟡 MEDIUM → 🟢 LOW (after fixes)
- **Complexity**: Onboarding completion logic with bootstrap re-running
- **Frequency**: Modified during auth flow redesigns
- **Impact**: White screens, redirect loops, onboarding bypasses

**Regression Scenarios**:
- Emergency auth fix → developer bypasses shared routing
- New auth screen → doesn't use shared routing utility
- Bootstrap logic changes → routing utility not updated

**Prevention** (IMPLEMENTED):
- Shared `routeAfterAuthSuccess()` with context tracking
- SSOT assertions: `assertAuthRoutingSSoT()` in auth screens
- Build-time detection: Grep for direct router navigation in auth screens

**Monitoring**:
```bash
# Detect auth routing drift
grep -r "router\.replace.*calendar" src/app/ | grep -v authRouting
```

---

## ⚠️ RISK #5: QUERY GATE INCONSISTENCY (LOW)

**Current State**: ✅ STRONG SSOT - 25+ files use `isAuthedForNetwork`

**Risk Factor**: 🟢 LOW
- **Complexity**: Simple boolean gate function
- **Frequency**: Modified when adding new data fetching
- **Impact**: Network storms, cascading 401s, fetch loops

**Drift Scenarios**:
- New feature → custom auth check instead of gate
- Copy-paste from external code → doesn't use gate
- Performance optimization → bypass gate for "read-only" data

**Current GOOD State**:
```typescript
// ✅ All 25+ files use this pattern:
enabled: isAuthedForNetwork(bootStatus, session)
```

**Prevention**:
- Strong convention already established
- ESLint rule potential: `prefer-auth-gate`
- Code review: Check new React Query hooks

---

## 📊 RISK SUMMARY

| Risk | Priority | Status | Prevention Strategy |
|------|----------|--------|-------------------|
| Apple Auth Drift | 🔴 Critical | ⚠️ Active | Replace welcome.tsx impl immediately |
| Email Verification | 🟠 High | 🔍 Needs audit | Extract shared verification utility |
| Auth State Checks | 🟡 Medium | 🟢 Stable | ESLint rules, runtime detection |
| Post-Auth Routing | 🟢 Low | ✅ Fixed | SSOT assertions, monitoring |
| Query Gates | 🟢 Low | ✅ Solid | Convention enforcement |

## 🔧 IMMEDIATE ACTIONS REQUIRED

1. **🔴 CRITICAL**: Replace welcome.tsx Apple Sign-In function with shared implementation
2. **🟠 HIGH**: Audit and consolidate email verification flows across 19 files
3. **🟡 MEDIUM**: Add ESLint rules for auth pattern enforcement

## 🛡️ LONG-TERM REGRESSION PREVENTION

### Build-Time Checks
```bash
# Add to CI pipeline
./scripts/check-auth-patterns.sh
```

### Runtime Assertions
```typescript
// Add to all auth screens
assertAuthRoutingSSoT('screen-name');
assertAppleAuthSSoT('screen-name'); // After consolidation
```

### Code Review Checklist
- [ ] New auth logic uses existing SSOT utilities
- [ ] React Query `enabled` uses `isAuthedForNetwork` gate
- [ ] Post-auth routing uses `routeAfterAuthSuccess`
- [ ] No direct `AppleAuthentication.signInAsync` calls
- [ ] Email verification uses shared utility (after creation)