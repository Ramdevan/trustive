import React from 'react';
import Head from 'next/head';
import ResetPasswordForm from '@/components/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <>
      <Head>
        <title>Reset Password | Trustive</title>
        <meta name="description" content="Choose a new password for your Trustive account" />
      </Head>
      <ResetPasswordForm />
    </>
  );
}
