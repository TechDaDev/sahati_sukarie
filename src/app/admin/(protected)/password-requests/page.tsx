import { redirect } from 'next/navigation';

export default function PasswordRequestsPage(): never {
  redirect('/admin');
}
