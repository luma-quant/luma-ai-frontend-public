import ReactMarkdown from 'react-markdown';

interface AdvisorReportMarkdownProps {
  markdown: string;
}

export const AdvisorReportMarkdown = ({
  markdown,
}: AdvisorReportMarkdownProps) => (
  <div className="prose prose-invert prose-p:text-text-secondary prose-headings:text-text-primary prose-a:text-accent-cyan prose-strong:text-text-primary prose-code:text-accent-cyan max-w-none font-sans">
    <ReactMarkdown>{markdown}</ReactMarkdown>
  </div>
);
