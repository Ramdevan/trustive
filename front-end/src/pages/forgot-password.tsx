import React from 'react';
import Head from 'next/head';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <>
      <Head>
        <title>Forgot Password | Trustive</title>
        <meta name="description" content="Reset your Trustive account password" />
      </Head>
      <ForgotPasswordForm />
    </>
  );
}
