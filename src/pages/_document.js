import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* LaunchAR SDK: loads early to enable WebXR on iOS via polyfill/redirect */}
        <script src={`https://launchar.app/sdk/v1?key=${process.env.NEXT_PUBLIC_LAUNCHAR_SDK_KEY}&redirect=true`}></script>
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
