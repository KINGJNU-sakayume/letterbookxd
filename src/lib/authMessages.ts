type AuthFailure = { code?: string; message?: string };

export function authFailureMessage(error: AuthFailure) {
  const code = error.code?.toLowerCase() ?? '';
  const detail = error.message?.toLowerCase() ?? '';

  if (code === 'email_not_confirmed' || detail.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다. 받은편지함의 인증 메일을 확인한 뒤 다시 로그인해 주세요.';
  }
  if (
    code === 'invalid_credentials' ||
    code === 'invalid_login_credentials' ||
    detail.includes('invalid login credentials')
  ) {
    return '이메일 또는 비밀번호가 올바르지 않습니다. 입력 내용을 다시 확인해 주세요.';
  }
  if (code === 'over_request_rate_limit' || detail.includes('rate limit')) {
    return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
