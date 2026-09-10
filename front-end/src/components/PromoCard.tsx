import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import backedCryptoImage from '@/assets/images/backed-crypto-image.png';

const PromoCard: React.FC = () => {
  return (
    <div className="rounded-2xl bg-card p-8 border border-white/5 flex flex-col justify-between overflow-hidden relative group flex-1">
      <div className="space-y-4 relative z-10">
        <h3 className="text-[2.25rem] font-normal leading-tight text-white">
          Secure your position <br />
          in asset backed <br />
          crypto
        </h3>
      </div>

      <div className="relative h-48 w-full flex items-center justify-center">
        <Image
          src={backedCryptoImage}
          alt="Asset Backed Crypto"
          className="object-contain w-full h-full"
          priority
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-accent/10 blur-3xl rounded-full -z-10" />
      </div>

      <Link href="/ico" className="cursor-pointer w-full rounded-xl bg-accent py-4 text-sm font-bold text-black transition-all hover:bg-accent/90 relative z-10 shadow-lg shadow-accent/20 text-center block">
        Go to ICO
      </Link>
    </div>
  );
};

export default PromoCard;
