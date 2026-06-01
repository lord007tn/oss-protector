import { repoShortName } from "@/lib/oss";

// Renders the suspect → reporters / affected-repos graph from real data.
export function TrustGraph({
	handle,
	initials,
	reporters,
	repoNames,
	reporterCount,
	affectedCount,
	height = 320,
}: {
	handle: string;
	initials: string;
	reporters: string[];
	repoNames: string[];
	reporterCount?: number;
	affectedCount?: number;
	height?: number;
}) {
	const cx = 400;
	const cy = height / 2;
	const mono = "var(--font-mono)";

	const shownReporters = reporters.slice(0, 5);
	const reporterNodes = shownReporters.map((login, index) => {
		const angle =
			(Math.PI / (shownReporters.length + 1)) * (index + 1) - Math.PI / 2;
		return {
			login,
			x: 140 + Math.cos(angle) * 90,
			y: cy + Math.sin(angle) * 110,
		};
	});

	const shownRepos = repoNames.slice(0, 4);
	const repoNodes = shownRepos.map((name, index) => {
		const angle =
			(Math.PI / (shownRepos.length + 1)) * (index + 1) - Math.PI / 2;
		return {
			name,
			x: 660 + Math.cos(angle) * 100,
			y: cy + Math.sin(angle) * 110,
		};
	});

	return (
		<svg
			aria-label={`Trust graph for ${handle}`}
			className="block"
			height={height}
			role="img"
			viewBox={`0 0 800 ${height}`}
			width="100%"
		>
			<title>{`Trust graph for @${handle}`}</title>
			<defs>
				<radialGradient cx="0.5" cy="0.5" id="suspectGlow">
					<stop offset="0" stopColor="var(--destructive)" stopOpacity="0.45" />
					<stop offset="1" stopColor="var(--destructive)" stopOpacity="0" />
				</radialGradient>
			</defs>

			{reporterNodes.map((node) => (
				<line
					key={`edge-r-${node.login}`}
					stroke="var(--success)"
					strokeDasharray="3 3"
					strokeOpacity="0.4"
					strokeWidth="1"
					x1={node.x}
					x2={cx}
					y1={node.y}
					y2={cy}
				/>
			))}
			{repoNodes.map((node) => (
				<line
					key={`edge-p-${node.name}`}
					stroke="var(--destructive)"
					strokeOpacity="0.4"
					strokeWidth="1.2"
					x1={cx}
					x2={node.x}
					y1={cy}
					y2={node.y}
				/>
			))}

			<circle cx={cx} cy={cy} fill="url(#suspectGlow)" r="60" />
			<circle
				cx={cx}
				cy={cy}
				fill="var(--destructive)"
				fillOpacity="0.14"
				r="32"
				stroke="var(--destructive)"
				strokeWidth="1.5"
			/>
			<text
				fill="var(--destructive)"
				fontFamily={mono}
				fontSize="14"
				fontWeight="600"
				textAnchor="middle"
				x={cx}
				y={cy + 5}
			>
				{initials}
			</text>
			<text
				fill="var(--muted-foreground)"
				fontFamily={mono}
				fontSize="11"
				textAnchor="middle"
				x={cx}
				y={cy + 52}
			>
				@{handle}
			</text>

			{reporterNodes.map((node) => (
				<g key={`node-r-${node.login}`}>
					<circle
						cx={node.x}
						cy={node.y}
						fill="var(--success)"
						fillOpacity="0.14"
						r="14"
						stroke="var(--success)"
						strokeWidth="1.2"
					/>
					<text
						fill="var(--muted-foreground)"
						fontFamily={mono}
						fontSize="11"
						textAnchor="middle"
						x={node.x}
						y={node.y + 25}
					>
						{node.login}
					</text>
				</g>
			))}
			{repoNodes.map((node) => (
				<g key={`node-p-${node.name}`}>
					<rect
						fill="var(--muted)"
						height="28"
						rx="6"
						stroke="var(--input)"
						strokeWidth="1"
						width="28"
						x={node.x - 14}
						y={node.y - 14}
					/>
					<text
						fill="var(--muted-foreground)"
						fontFamily={mono}
						fontSize="11"
						textAnchor="middle"
						x={node.x}
						y={node.y + 25}
					>
						{repoShortName(node.name)}
					</text>
				</g>
			))}

			<text
				fill="var(--muted-foreground)"
				fontFamily={mono}
				fontSize="10"
				letterSpacing="0.08em"
				textAnchor="middle"
				x="140"
				y="32"
			>
				REPORTERS: {reporterCount ?? reporters.length}
			</text>
			<text
				fill="var(--muted-foreground)"
				fontFamily={mono}
				fontSize="10"
				letterSpacing="0.08em"
				textAnchor="middle"
				x="400"
				y="32"
			>
				SUSPECT
			</text>
			<text
				fill="var(--muted-foreground)"
				fontFamily={mono}
				fontSize="10"
				letterSpacing="0.08em"
				textAnchor="middle"
				x="660"
				y="32"
			>
				AFFECTED REPOS: {affectedCount ?? repoNames.length}
			</text>
		</svg>
	);
}
