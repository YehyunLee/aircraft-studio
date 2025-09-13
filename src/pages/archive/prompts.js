import { useState } from 'react';
import Head from 'next/head';

export default function Prompts() {
  const [prompt, setPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsLoading(true);
    setError('');
    setEnhancedPrompt('');

    try {
      const response = await fetch('/api/prompt-engineering', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to enhance prompt');
      }

      setEnhancedPrompt(data.enhancedPrompt);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnhancePrompt();
    }
  };

  return (
    <>
      <Head>
        <title>Prompt Engineering - Aircraft Studio</title>
        <meta name="description" content="Transform your ideas into detailed image generation prompts" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-2 text-center">
              Prompt Engineering Studio
            </h1>
            <p className="text-gray-400 text-center mb-8">
              Transform your ideas into detailed prompts for image generation
            </p>

            <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter your idea
              </label>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Describe what you want to create... (e.g., 'a futuristic aircraft flying through clouds')"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows="4"
                />
              </div>
              
              {error && (
                <div className="mt-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleEnhancePrompt}
                disabled={isLoading}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition duration-200 ease-in-out transform hover:scale-[1.02]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Enhancing prompt...
                  </span>
                ) : (
                  'Enhance Prompt'
                )}
              </button>
            </div>

            {enhancedPrompt && (
              <div className="bg-gray-800 rounded-lg shadow-xl p-6 animate-fadeIn">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-300">
                    Enhanced Prompt
                  </label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(enhancedPrompt);
                    }}
                    className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition"
                  >
                    Copy
                  </button>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-white leading-relaxed">
                    {enhancedPrompt}
                  </p>
                </div>
                <div className="mt-4 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                  <p className="text-sm text-blue-300">
                    This enhanced prompt is ready to be used for image generation. 
                    It includes specific details about style, composition, and atmosphere to produce better results.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }
      `}</style>
    </>
  );
}