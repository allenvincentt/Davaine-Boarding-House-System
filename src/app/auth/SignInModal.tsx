import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal as RNModal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { SplashScreen } from '@/components/common/SplashScreen';
import { useSnackbar } from '@/components/common/Snackbar';
import { AppIcon } from '@/components/ui/AppIcon';
import { Input } from '@/components/ui/Input';
import { GlowingButton } from '@/components/ui/buttons/GlowingButton';
import { GradientButton } from '@/components/ui/buttons/GradientButton';
import { Modal } from '@/components/ui/modals/Modal';
import { DefaultTheme } from '@/constants/defaultTheme';
import { Gradient } from '@/constants/gradient';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import type { AdminUserModel } from '@/models/adminUserModel';
import { useAuth } from '@/providers/AuthProvider';
import { isGuestRole } from '@/services/accessControl';

type SignInModalProps = {
  visible: boolean;
  onClose: () => void;
  onForgotPassword?: () => void;
  onGuestSignIn?: () => void;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const webHeroGradient: ViewStyle & { backgroundImage: string } = {
  backgroundImage: Gradient.base,
};

export function SignInModal({
  visible,
  onClose,
  onForgotPassword,
  onGuestSignIn,
}: SignInModalProps) {
  const router = useRouter();
  const snackbar = useSnackbar();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const { biometricKind, biometricAvailable, biometricSignInEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [enableFingerprintSignIn, setEnableFingerprintSignIn] = useState(false);

  const guestHandlerRef = useRef(onGuestSignIn);
  const resetFlowRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    guestHandlerRef.current = onGuestSignIn;
  }, [onGuestSignIn]);

  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setFieldErrors({});
    setEnableFingerprintSignIn(false);
  }, []);

  const handleSignedIn = useCallback(
    (profile: AdminUserModel) => {
      snackbar.success(`Welcome back, ${profile.fullName.split(' ')[0]}.`);

      if (isGuestRole(profile.userRole)) {
        onClose();
        resetForm();
        resetFlowRef.current();
        guestHandlerRef.current?.();
        return;
      }
      router.replace('/admin-pages/DashboardPage');
    },
    [router, onClose, resetForm, snackbar],
  );

  const { status, errorMessage, submit, submitBiometric, reset } = useSignInFlow(handleSignedIn);

  useEffect(() => {
    resetFlowRef.current = reset;
  }, [reset]);

  const isSubmitting = status === 'submitting';

  const canOfferFingerprintEnrollment =
    Platform.OS !== 'web' && biometricKind === 'fingerprint' && !biometricSignInEnabled;

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    onClose();
    resetForm();
    reset();
  }, [isSubmitting, onClose, resetForm, reset]);

  const openLegal = useCallback(
    (path: '/legal/TermsPage' | '/legal/PrivacyPolicyPage') => {
      handleClose();
      router.push(path);
    },
    [handleClose, router],
  );

  const handleChangeEmail = useCallback((text: string) => {
    setEmail(text);
    setFieldErrors((current) => (current.email ? { ...current, email: undefined } : current));
  }, []);

  const handleChangePassword = useCallback((text: string) => {
    setPassword(text);
    setFieldErrors((current) => (current.password ? { ...current, password: undefined } : current));
  }, []);

  const handleSubmit = useCallback(() => {
    const nextErrors: FieldErrors = {};

    if (!email.trim()) {
      nextErrors.email = 'Email is required';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address';
    }

    if (!password) {
      nextErrors.password = 'Password is required';
    } else if (password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters';
    }

    if (nextErrors.email || nextErrors.password) {
      setFieldErrors(nextErrors);
      return;
    }

    submit(email.trim(), password, enableFingerprintSignIn);
  }, [email, password, enableFingerprintSignIn, submit]);

  const handleToggleEnableFingerprint = useCallback(() => {
    setEnableFingerprintSignIn((current) => !current);
  }, []);

  const handleBiometricSignIn = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    submitBiometric();
  }, [isSubmitting, submitBiometric]);

  const signInLabel = useMemo(
    () =>
      isSubmitting ? (
        <>
          <Text style={styles.signInLabel}>Signing In…</Text>
          <ActivityIndicator color={DefaultTheme.colors.white} />
        </>
      ) : (
        <>
          <Text style={styles.signInLabel}>Sign In</Text>
          <Text style={styles.signInArrow}>{'→'}</Text>
        </>
      ),
    [isSubmitting],
  );

  return (
    <>
      <Modal
        visible={visible && status !== 'success'}
        onClose={handleClose}
        dismissOnBackdropPress={!isSubmitting}
        sheetHandleFloating
        contentStyle={styles.modalContent}>
        <View style={[styles.hero, isMobile && styles.heroMobile]}>
          <View
            pointerEvents="none"
            style={[styles.heroGradient, Platform.OS === 'web' && webHeroGradient]}
          />
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close sign in"
            hitSlop={10}
            style={styles.closeButton}>
            <AppIcon name="close" size={16} tintColor={DefaultTheme.colors.white} />
          </Pressable>
          <View style={styles.heroMark}>
            <Image
              accessible={false}
              source={require('../../../assets/images/davaine-mark.svg')}
              contentFit="contain"
              style={styles.heroMarkImage}
            />
          </View>
        </View>

        <View style={[styles.sheet, isMobile && styles.sheetMobile]}>
          <Text style={styles.title}>Sign In</Text>

          {biometricAvailable && (
            <>
              <GlowingButton
                label="Sign in with Fingerprint"
                onPress={handleBiometricSignIn}
                style={[styles.biometricButton, isSubmitting && styles.biometricButtonDisabled]}
              />
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or sign in with password</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          <Input
            label="Email Address"
            value={email}
            onChangeText={handleChangeEmail}
            error={fieldErrors.email}
            icon="at"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            style={styles.field}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={handleChangePassword}
            error={fieldErrors.password}
            icon="lock"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            style={styles.field}
          />

          {canOfferFingerprintEnrollment && (
            <Pressable
              onPress={handleToggleEnableFingerprint}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: enableFingerprintSignIn }}
              accessibilityLabel="Enable Fingerprint Sign In Next Time"
              hitSlop={8}
              style={styles.fingerprintRow}>
              <View style={[styles.checkbox, enableFingerprintSignIn && styles.checkboxChecked]}>
                {enableFingerprintSignIn && (
                  <AppIcon name="check" size={11} tintColor={DefaultTheme.colors.white} />
                )}
              </View>
              <Text style={styles.fingerprintLabel}>Enable Fingerprint Sign In Next Time</Text>
            </Pressable>
          )}

          {status === 'error' && <Text style={styles.generalError}>{errorMessage}</Text>}

          <GradientButton
            accessibilityLabel="Sign in"
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={styles.submitButton}>
            {signInLabel}
          </GradientButton>

          <Pressable
            onPress={onForgotPassword}
            accessibilityRole="button"
            accessibilityLabel="Forgot your password"
            style={styles.forgotButton}
            hitSlop={8}>
            <Text style={styles.forgotText}>Forgot your password?</Text>
          </Pressable>

          <Text style={styles.legalText}>
            By signing in, you agree to the{' '}
            <Text accessibilityRole="link" style={styles.legalLink} onPress={() => openLegal('/legal/TermsPage')}>
              Terms and Conditions
            </Text>{' '}
            and{' '}
            <Text accessibilityRole="link" style={styles.legalLink} onPress={() => openLegal('/legal/PrivacyPolicyPage')}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </Modal>

      <RNModal visible={visible && status === 'success'} transparent={false} animationType="fade" statusBarTranslucent>
        <SplashScreen status="loading" loadingMessage="Signing you in…" />
      </RNModal>
    </>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    maxWidth: 400,
  },
  hero: {
    height: 210,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMobile: {
    height: 260,
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: Gradient.base,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 34,
    height: 34,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroMark: {
    width: 72,
    height: 72,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DefaultTheme.colors.white,
  },
  heroMarkImage: {
    width: 40,
    height: 40,
  },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: DefaultTheme.radius.lg,
    borderTopRightRadius: DefaultTheme.radius.lg,
    backgroundColor: DefaultTheme.colors.white,
    paddingHorizontal: 26,
    paddingTop: 40,
    paddingBottom: 48,
  },
  sheetMobile: {
    paddingTop: 52,
    paddingBottom: 72,
  },
  title: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 27,
    textAlign: 'center',
  },
  biometricButton: {
    marginTop: 26,
    marginHorizontal: 8,
    alignSelf: 'stretch',
  },
  biometricButtonDisabled: {
    opacity: 0.5,
  },
  fingerprintRow: {
    marginTop: 16,
    marginHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: DefaultTheme.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: DefaultTheme.colors.primary,
    borderColor: DefaultTheme.colors.primary,
  },
  fingerprintLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  dividerRow: {
    marginTop: 20,
    marginHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: DefaultTheme.colors.line,
  },
  dividerText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  field: {
    marginTop: 22,
    marginHorizontal: 8,
  },
  generalError: {
    marginTop: 16,
    marginHorizontal: 8,
    color: '#D64545',
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 26,
    alignSelf: 'stretch',
  },
  signInLabel: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  signInArrow: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 16,
    lineHeight: 16,
  },
  forgotButton: {
    marginTop: 18,
    alignSelf: 'center',
  },
  forgotText: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  legalText: {
    marginTop: 16,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
  },
  legalLink: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    textDecorationLine: 'underline',
  },
});
