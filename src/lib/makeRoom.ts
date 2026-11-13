import { Node } from "reactflow";

const widthOf = (n: Node, fallback = 400) =>
  (n.style?.width as number) ?? n.width ?? fallback;

/**
 * Makes room for a block that became `dx` wider (or gives the room back for a negative
 * `dx`): the nodes right of it move by `dx`, and so does everything right of each group
 * around it, while these groups get `dx` wider. Without the outer levels, a block opened
 * inside a group (e.g. the Grover Oracle in "Grover Search Algorithm") widens the group
 * over the nodes that follow it.
 *
 * `anchor` is the block at its original position (left edge and parent).
 */
export function makeRoom(
  nodes: Node[],
  anchor: { position: { x: number }; parentNode?: string },
  dx: number,
): Node[] {
  if (dx === 0) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const moved = new Set<string>();
  const widened = new Set<string>();

  let parentNode = anchor.parentNode;
  let x = anchor.position.x;
  const visited = new Set<string>();
  for (;;) {
    for (const n of nodes) {
      if (n.parentNode === parentNode && n.position.x > x) moved.add(n.id);
    }
    if (!parentNode || visited.has(parentNode)) break;
    visited.add(parentNode);
    const parent = byId.get(parentNode);
    if (!parent) break;
    widened.add(parent.id);
    x = parent.position.x;
    parentNode = parent.parentNode;
  }

  return nodes.map((n) => {
    if (!moved.has(n.id) && !widened.has(n.id)) return n;
    let next = n;
    if (moved.has(n.id)) {
      next = {
        ...next,
        position: { ...next.position, x: next.position.x + dx },
      };
    }
    if (widened.has(n.id)) {
      const width = Math.max(0, widthOf(n) + dx);
      next = { ...next, style: { ...next.style, width }, width };
    }
    return next;
  });
}

/** Space between the content of a group and its border. */
const GROUP_PADDING = 30;

const sizeOf = (n: Node) => ({
  width: (n.style?.width as number) ?? n.width ?? 220,
  height: (n.style?.height as number) ?? n.height ?? 200,
});

/**
 * Grows every group around `parentId` (innermost first) until its children fit inside,
 * e.g. after a block in a group was opened into a taller circuit, or one whose Splitter
 * and Merger reach further than the block did. A group that gets wider pushes the nodes
 * right of it away (see makeRoom); groups never shrink here.
 */
export function fitGroupsAround(
  nodes: Node[],
  parentId: string | undefined,
): Node[] {
  let result = nodes;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const group = result.find((n) => n.id === parentId);
    if (!group || group.data?.collapsed) break;
    const children = result.filter((n) => n.parentNode === parentId);
    if (children.length === 0) break;
    const right = Math.max(
      ...children.map((c) => c.position.x + sizeOf(c).width),
    );
    const bottom = Math.max(
      ...children.map((c) => c.position.y + sizeOf(c).height),
    );
    const { width, height } = sizeOf(group);
    const newWidth = Math.max(width, right + GROUP_PADDING);
    const newHeight = Math.max(height, bottom + GROUP_PADDING);
    if (newWidth !== width || newHeight !== height) {
      result = result.map((n) =>
        n.id === parentId
          ? {
              ...n,
              style: { ...n.style, width: newWidth, height: newHeight },
              width: newWidth,
              height: newHeight,
            }
          : n,
      );
      // the extra width moves what follows the group (and widens the outer groups)
      if (newWidth > width) result = makeRoom(result, group, newWidth - width);
    }
    parentId = group.parentNode;
  }
  return result;
}
