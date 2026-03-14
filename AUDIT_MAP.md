# Auth Flow Stabilization Audit Map

## 🔍 AUDIT FINDINGS: POTENTIAL DRIFT POINTS

### 1. ✅ AUTH GATES - GOOD SSOT PATTERN
**FINDING**: Strong SSOT pattern for auth checking
- `isAuthedForNetwork(bootStatus, session)` consistently used across 25+ files
- `authedGate.ts` - SSOT for authenticated network gate checking
- `networkAuthGate.ts` - SSOT for post-logout network blocking
- **NO DUPLICATION FOUND**: All React Query `enabled` conditions use SSOT gate

### 2. 🔶 APPLE SIGN-IN - PARTIALLY CONSOLIDATED
**FINDING**: Recently consolidated but may have legacy patterns
- **✅ GOOD**: Shared implementation in `sharedAppleAuth.ts`
- **✅ GOOD**: Both login.tsx and welcome.tsx use `handleSharedAppleSignIn`
- **⚠️ CHECK NEEDED**: Verify no old Apple auth patterns remain in other files
- **Files using Apple auth**: login.tsx, welcome.tsx, sharedAppleAuth.ts, appleSignIn.ts

### 3. ⚠️ POST-AUTH ROUTING - POTENTIAL DUPLICATION
**FINDING**: Different routing strategies between screens
- **login.tsx**: Uses `routeAfterAuthSuccess()` function with onboarding check logic
- **welcome.tsx**: Uses direct `router.replace("/calendar")`
- **RISK**: Post-auth routing logic is duplicated and may drift
- **ACTION NEEDED**: Extract to shared routing utility

### 4. ✅ FRIEND DISCOVERY - GOOD SSOT
**FINDING**: Proper SSOT usage confirmed
- `FriendDiscoverySurface` component used by both:
  - `/app/add-friends.tsx`
  - `/app/onboarding.tsx`
- **NO DUPLICATION**: Single implementation shared correctly

### 5. 🔶 EMAIL VERIFICATION - NEEDS INVESTIGATION
**FINDING**: Email verification appears in 19 files
- **Files to check**: LoginWithEmailPassword.tsx, welcome.tsx, verify-email.tsx
- **POTENTIAL RISK**: Verification flow logic may be duplicated
- **ACTION NEEDED**: Audit for duplicated verification patterns

### 6. ✅ SESSION TOKEN HANDLING - CONSOLIDATED
**FINDING**: Session token management is centralized
- **SSOT**: `authClient.ts` for token operations
- **SSOT**: `exactAppleAuthBootstrap.ts` for Apple auth bootstrap
- **GOOD**: Limited files (5) use session token functions directly
- **NO DUPLICATION FOUND**: Token handling is properly centralized

## 🚨 TOP PRIORITY DRIFT RISKS

### HIGH RISK: Post-Auth Routing Duplication
```typescript
// login.tsx pattern
async function routeAfterAuthSuccess(router: any): Promise<void> {
  // Complex onboarding check logic...
}

// welcome.tsx pattern
router.replace("/calendar");
```
**IMPACT**: If onboarding logic changes, only login.tsx gets updated
**SOLUTION**: Extract to shared `routeAfterAuth()` utility

### MEDIUM RISK: Email Verification Flows
- 19 files mention email verification
- Need to verify no duplication in verification submission/retry logic
- High complexity flows prone to drift

### LOW RISK: Apple Sign-In Legacy
- Recently consolidated, low risk of active drift
- May have legacy patterns in unused files

## ✅ COMPLETED FIXES

### 1. Post-Auth Routing SSOT (FIXED)
- **✅ CREATED**: `src/lib/authRouting.ts` - Shared routing utility
- **✅ UPDATED**: login.tsx to use `routeAfterAuthSuccess()` with context
- **✅ UPDATED**: welcome.tsx to use shared routing in `handleFinishOnboarding`
- **✅ ADDED**: SSOT assertion calls for drift detection
- **IMPACT**: Eliminated routing logic duplication, centralized onboarding checks

### 2. Apple Sign-In Major Duplication (IDENTIFIED)
- **⚠️ CRITICAL FINDING**: welcome.tsx has 200+ lines of duplicated Apple auth logic
- **RISK**: welcome.tsx Apple auth will drift from login.tsx shared implementation
- **STATUS**: login.tsx uses shared implementation, welcome.tsx still has duplicate
- **ACTION NEEDED**: Replace welcome.tsx Apple function with `handleSharedAppleSignIn`

## 🔧 REMAINING AUDIT STEPS

### 1. Apple Sign-In Duplication (CRITICAL)
- **BLOCKER**: Replace 200+ line handleAppleSignIn in welcome.tsx with shared implementation
- **COMPLEXITY**: Function has different success handling (setCurrentSlide vs router navigation)
- **RISK**: High - Apple auth logic will continue to drift

### 2. Email Verification Audit (MEDIUM)
- Check for duplicated verification submission logic
- Verify resend/retry patterns are consistent
- Look for drift in error handling

### 3. Dead Code Cleanup (LOW)
- Remove unused Apple auth imports in welcome.tsx after fix
- Remove duplicated AppleAuthentication loading logic
- Clean up old verification code

## 📊 AUDIT STATISTICS & PROGRESS

- **Total files with auth patterns**: 84
- **Files using authed gates**: 25+ (✅ Good SSOT)
- **Files with Apple auth**: 4 (⚠️ welcome.tsx has 200+ line duplication)
- **Files with friend discovery**: 2 (✅ Good SSOT)
- **Files with email verification**: 19 (⚠️ Needs audit)
- **Files with routing**: 62 (✅ Post-auth routing now using SSOT)

## 🎯 PROGRESS TRACKING

- [x] **Zero duplicated post-auth routing logic** ✅ COMPLETE
- [ ] **Single Apple auth SSOT** ⚠️ IN PROGRESS (major blocker in welcome.tsx)
- [ ] **Single email verification flow SSOT** ⏳ PENDING
- [ ] **No unused Apple auth patterns** ⏳ PENDING (depends on Apple SSOT)
- [x] **Runtime invariants catching auth drift** ✅ COMPLETE (SSOT assertions added)
- [x] **Updated governance docs** ✅ COMPLETE (this audit map)
- [ ] **Clean typecheck and verification** ⏳ PENDING

## 🚀 STABILIZATION IMPACT

### ✅ ACHIEVED
1. **Eliminated post-auth routing drift** - Single source for login → calendar/onboarding routing
2. **Added runtime SSOT detection** - Development assertions catch auth pattern drift
3. **Confirmed auth gates are solid** - 25+ files consistently use `isAuthedForNetwork` SSOT
4. **Verified friend discovery SSOT** - Both screens properly share `FriendDiscoverySurface`

### ⚠️ CRITICAL REMAINING WORK
1. **Apple Sign-In massive duplication** - 200+ lines in welcome.tsx duplicate shared auth logic
2. **Email verification audit** - 19 files to check for verification flow duplication

**RECOMMENDATION**: Complete Apple Sign-In consolidation immediately as it's the highest regression risk.