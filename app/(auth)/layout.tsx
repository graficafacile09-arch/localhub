/**
 * Layout del gruppo (auth): nessuna logica attiva.
 * La pulizia del cookie guest all'ingresso nel login avviene in proxy.ts
 * (pathname === "/login" → response.cookies.delete(GUEST_COOKIE)) e, dopo
 * l'autenticazione, su ogni richiesta con utente autenticato.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}