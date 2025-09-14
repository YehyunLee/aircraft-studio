import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  const sdkKey = process.env.NEXT_PUBLIC_LAUNCHAR_SDK_KEY;
  return (
    <Html lang="en">
      <Head>
        {/* LaunchAR SDK: load as early as possible in the document head */}
        <script src={`https://launchar.app/sdk/v1?key=${sdkKey}&redirect=true`}></script>
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
