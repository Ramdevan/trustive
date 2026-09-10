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
        {/* The diamond mark, matching the admin console. Declared once and
            only here — having a second rel="icon" in _app made the tab swap
            icons on hydration. */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
