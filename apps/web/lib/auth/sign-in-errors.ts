/** Translate SDK HTTP errors into clear, non-enumerating, non-sensitive UI messages. */
function responseStatus(value:unknown):number|null{
  if(!value||typeof value!=='object')return null;
  const record=value as Record<string,unknown>;
  const nested=record.error&&typeof record.error==='object'?
    record.error as Record<string,unknown>:null;
  const response=record.response&&typeof record.response==='object'?
    record.response as Record<string,unknown>:null;
  const raw=record.status??nested?.status??response?.status;
  const number=typeof raw==='number'?raw:typeof raw==='string'?Number(raw):NaN;
  return Number.isInteger(number)&&number>=400&&number<=599?number:null;
}

export function signInFailureMessage(error:unknown):string{
  const status=responseStatus(error);
  if(status===403)return 'Please verify your email address before signing in.';
  if(status===429)return 'Too many sign-in attempts. Please try again later.';
  if(status!==null&&status>=500)return 'Sign-in service is temporarily unavailable. Try again later.';
  // 400 / 401 / malformed responses: never reveal whether a particular email exists.
  return 'Sign-in could not be completed. Check your email and password, or reset your password.';
}
