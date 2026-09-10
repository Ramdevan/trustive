import React from 'react';
import Head from 'next/head';
import RegisterForm from '@/components/RegisterForm';

export default function Register() {
  return (
    <>
      <Head>
        <title>Register | Trustive ICO Platform</title>
        <meta name="description" content="Create a new account on the Trustive ICO Platform" />
      </Head>
      <main>
        <RegisterForm />
      </main>
    </>
  );
}
