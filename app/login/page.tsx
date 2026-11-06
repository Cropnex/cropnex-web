import LoginForm from '@/components/auth/LoginForm';
import {parseAuthEntry,type AuthEntryQuery} from '@/lib/auth-entry';
import {CROPNEX_LAUNCHED} from '@/lib/app-meta';

// Read query parameters on the server so the initial response contains the form,
// rather than a Suspense-only screen waiting for browser hydration.
export default async function LoginPage({searchParams}:{searchParams:Promise<AuthEntryQuery>}){
  const options=parseAuthEntry(await searchParams);
  return <>
    <LoginForm initialMode={options.initialMode} preSubscribe={options.preSubscribe&&!CROPNEX_LAUNCHED}/>
    <noscript><p style={{padding:'1rem',background:'#fff3cd',color:'#332701'}}>CropNex needs JavaScript to sign in. Enable JavaScript for this site, or open it in an up-to-date browser.</p></noscript>
  </>;
}
