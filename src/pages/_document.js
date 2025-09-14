import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  const sdkKey = process.env.NEXT_PUBLIC_LAUNCHAR_SDK_KEY;
  return (
    <Html lang="en">
      <Head>
        {/* LaunchAR SDK: load as early as possible in the document head */}
        <script src={`https://launchar.app/sdk/v1?key=${sdkKey}&redirect=true`}></script>
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
