'use client';

export default function ImportWorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl py-16 text-center" role="alert">
      <h1 className="text-xl font-semibold text-gray-900">Catalog imports could not be loaded</h1>
      <p className="mt-3 text-sm leading-6 text-gray-500">
        We could not reach the catalog service. Your products and import history are unchanged.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium shopnest-primary"
      >
        Try again
      </button>
    </section>
  );
}
