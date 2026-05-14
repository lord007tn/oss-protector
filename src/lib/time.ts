export const unixNow = () => Math.floor(Date.now() / 1000);

export const toUnixSeconds = (value?: null | string) => {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? null
		: Math.floor(date.getTime() / 1000);
};

export const formatShortDate = (value?: null | number) => {
	if (!value) {
		return "n/a";
	}
	return new Date(value * 1000).toLocaleDateString("en", {
		day: "numeric",
		month: "short",
	});
};
