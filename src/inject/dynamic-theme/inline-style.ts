import {iterateCSSDeclarations} from './css-rules';
import {getModifiableCSSDeclaration, ModifiableCSSDeclaration} from './modify-css';
import {FilterConfig} from '../../definitions';

let elementsCounter = 0;
const inlineStyleElementsIds = new WeakMap<Node, number>();
const inlineStyleOverrides = new Map<Node, string>();
let observer: MutationObserver = null;

export function getInlineStylesOverrides(filter: FilterConfig) {
    const elements = Array.from(document.querySelectorAll('[style]'));
    elements.forEach((el) => elementDidUpdate(el as HTMLElement, filter));
    return Array.from(inlineStyleOverrides.values()).filter((x) => x);
}

function expand(nodes: Node[], selector: string) {
    const results: Node[] = [];
    nodes.forEach((n) => {
        if (n instanceof Element) {
            if (n.matches(selector)) {
                results.push(n);
            }
            results.push(...Array.from(n.querySelectorAll(selector)));
        }
    });
    return results;
}

export function watchForInlineStyles(filter: FilterConfig, update: (styles: string[]) => void) {
    if (observer) {
        observer.disconnect();
    }
    observer = new MutationObserver((mutations) => {
        const prevValues = new Map<Node, string>();
        inlineStyleOverrides.forEach((value, key) => prevValues.set(key, value));
        let didStyleChange = false;
        mutations.forEach((m) => {
            const createdInlineStyles = expand(Array.from(m.addedNodes), '[style]');
            const removedInlineStyles = expand(Array.from(m.removedNodes), '[style]');;
            if (createdInlineStyles.length > 0) {
                didStyleChange = true;
                createdInlineStyles.forEach((el) => elementDidUpdate(el as HTMLElement, filter));
            }
            if (removedInlineStyles.length > 0) {
                didStyleChange = true;
                Array.from(m.removedNodes).forEach(elementDidUnmount);
            }
            if (m.target && m.target instanceof Element && m.target.hasAttribute('style')) {
                didStyleChange = true;
                elementDidUpdate(m.target as HTMLElement, filter);
            }
        });
        if (didStyleChange) {
            if (Array.from(inlineStyleOverrides.entries()).some(([node, value]) => prevValues.get(node) !== value)) {
                update(Array.from(inlineStyleOverrides.values()).filter((x) => x));
            }
        }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['style']});
}

export function stopWatchingForInlineStyles() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

function elementDidUpdate(element: HTMLElement, filter: FilterConfig) {
    if (!inlineStyleOverrides.has(element)) {
        const id = ++elementsCounter;
        inlineStyleElementsIds.set(element, id);
    }
    const override = getInlineStyleOverride(element, filter);
    inlineStyleOverrides.set(element, override);
}

function elementDidUnmount(element: HTMLElement) {
    inlineStyleOverrides.delete(element);
}

function getInlineStyleOverride(element: HTMLElement, filter: FilterConfig) {
    const modDecs: ModifiableCSSDeclaration[] = [];
    element.style && iterateCSSDeclarations(element.style, (property, value) => {
        // Temporaty ignore background images
        // due to possible performance issues
        // and complexity of handling async requests
        if (property === 'background-image') {
            return;
        }
        const mod = getModifiableCSSDeclaration(property, value, null, null);
        if (mod) {
            modDecs.push(mod);
        }
    });

    if (modDecs.length > 0) {
        const id = inlineStyleElementsIds.get(element).toString(16);
        element.dataset.darkreaderInlineId = id;
        const selector = `[data-darkreader-inline-id="${id}"]`;
        const lines: string[] = [];
        lines.push(`${selector} {`);
        modDecs.forEach(({property, value}) => {
            const val = typeof value === 'function' ? value(filter) : value;
            if (val) {
                lines.push(`    ${property}: ${val} !important;`);
            }
        });
        lines.push('}');
        return lines.join('\n');
    }

    return null;
}
