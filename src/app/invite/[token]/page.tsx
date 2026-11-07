import InviteLanding from './InviteLanding';

// /invite/<token>: keeps the token on this device, then hands off to the app,
// which asks the person to sign up or log in and then accept. The token is
// never sent anywhere except the acceptInvite callable.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteLanding token={token} />;
}
