import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Picks the root font-size bracket from the physical display width.
            screen.width does not change with browser zoom, so the root size
            stays put across the zoom range instead of fighting it. Runs in
            <head> so it lands before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var w=window.screen&&window.screen.width||0;var d=w>=5120?"5k":w>=3840?"4k":w>=2560?"qhd":w>=1920?"fhd":"";if(d)document.documentElement.setAttribute("data-display",d);}catch(e){}})();`,
          }}
        />
        {/* Favicon & App Icons */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
