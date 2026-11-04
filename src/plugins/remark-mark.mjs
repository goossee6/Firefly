/**
 * remark-mark: 将 ==高亮== 语法转为 <mark> 标签
 */
import { visit } from "unist-util-visit";

/** @type {import("unified").Plugin} */
export default function remarkMark() {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || index === undefined) return;
			if (!/==.+?==/.test(node.value)) return;

			const parts = node.value.split(/(==.+?==)/g);
			const children = parts.filter(Boolean).flatMap((part) => {
				const m = part.match(/^==(.+?)==$/);
				if (m) {
					return [
						{ type: "html", value: "<mark>" },
						{ type: "text", value: m[1] },
						{ type: "html", value: "</mark>" },
					];
				}
				return { type: "text", value: part };
			});

			parent.children.splice(index, 1, ...children);
			return index + children.length;
		});
	};
}
