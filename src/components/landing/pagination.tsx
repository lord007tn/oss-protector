import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DirectoryPaginationProps {
	basePath: string;
	currentPage: number;
	pageCount: number;
	params: Record<string, number | string>;
}

export function DirectoryPagination({
	basePath,
	currentPage,
	pageCount,
	params,
}: DirectoryPaginationProps) {
	if (pageCount <= 1) {
		return null;
	}

	const pages = pageRange(currentPage, pageCount);

	return (
		<nav
			aria-label="Directory pagination"
			className="flex flex-wrap items-center justify-between gap-3"
		>
			<a
				aria-disabled={currentPage === 1}
				className={cn(
					buttonVariants({ variant: "outline" }),
					currentPage === 1 && "pointer-events-none opacity-50"
				)}
				href={pageHref(basePath, params, currentPage - 1)}
			>
				<ChevronLeft data-icon="inline-start" />
				Previous
			</a>
			<div className="flex flex-wrap justify-center gap-1">
				{pages.map((page) => (
					<a
						aria-current={page === currentPage ? "page" : undefined}
						className={buttonVariants({
							variant: page === currentPage ? "default" : "outline",
						})}
						href={pageHref(basePath, params, page)}
						key={page}
					>
						{page}
					</a>
				))}
			</div>
			<a
				aria-disabled={currentPage === pageCount}
				className={cn(
					buttonVariants({ variant: "outline" }),
					currentPage === pageCount && "pointer-events-none opacity-50"
				)}
				href={pageHref(basePath, params, currentPage + 1)}
			>
				Next
				<ChevronRight data-icon="inline-end" />
			</a>
		</nav>
	);
}

export function paginateItems<Item>({
	items,
	page,
	pageSize,
}: {
	items: Item[];
	page: number;
	pageSize: number;
}) {
	const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
	const currentPage = Math.min(Math.max(1, page), pageCount);
	const startIndex = (currentPage - 1) * pageSize;

	return {
		currentPage,
		end: Math.min(startIndex + pageSize, items.length),
		items: items.slice(startIndex, startIndex + pageSize),
		pageCount,
		start: items.length === 0 ? 0 : startIndex + 1,
		total: items.length,
	};
}

function pageHref(
	basePath: string,
	params: Record<string, number | string>,
	page: number
) {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (key === "page") {
			continue;
		}
		if (value === "" || value === 0 || value === "all") {
			continue;
		}
		searchParams.set(key, String(value));
	}
	if (page > 1) {
		searchParams.set("page", String(page));
	}
	const query = searchParams.toString();
	return query ? `${basePath}?${query}` : basePath;
}

function pageRange(currentPage: number, pageCount: number) {
	const start = Math.max(1, currentPage - 2);
	const end = Math.min(pageCount, start + 4);
	const normalizedStart = Math.max(1, end - 4);
	const pages: number[] = [];
	for (let page = normalizedStart; page <= end; page += 1) {
		pages.push(page);
	}
	return pages;
}
