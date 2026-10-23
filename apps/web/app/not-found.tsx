export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-8xl font-bold text-gray-300 mb-6">404</div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Page Not Found</h1>
        <a
          href="/"
          className="text-blue-600 hover:text-blue-800 transition-colors"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}
