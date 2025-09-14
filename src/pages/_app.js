import "@/styles/globals.css";
import Script from "next/script";

export default function App({ Component, pageProps }) {
  const sdkKey = process.env.NEXT_PUBLIC_LAUNCHAR_SDK_KEY;
  return (
    <>
      {/* Load Launch SDK as early as possible for iOS WebXR support */}
      {sdkKey ? (
        <Script
          src={`https://launchar.app/sdk/v1?key=${sdkKey}`}
          strategy="beforeInteractive"
        />
      ) : (
        <Script id="vlaunch-missing-key" strategy="beforeInteractive">
          {`console.warn('[LaunchAR] NEXT_PUBLIC_LAUNCHAR_SDK_KEY is not set. iOS WebXR will not work.');`}
        </Script>
      )}
      <Component {...pageProps} />
    </>
  );
}
