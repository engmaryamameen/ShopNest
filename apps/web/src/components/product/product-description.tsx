import Markdown from 'react-markdown';

export function ProductDescription({ value, className = '' }: { value: string; className?: string }) {
  return <div className={`[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 ${className}`}><Markdown skipHtml allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'br']} unwrapDisallowed>{value}</Markdown></div>;
}
