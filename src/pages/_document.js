import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* LaunchAR SDK: load as early as possible in the document head */}
        <script src="https://launchar.app/sdk/v1?key=cQ5j8qCUsFSnAeFXLjdFlWiy7pZrvEpL&redirect=true"></script>
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
