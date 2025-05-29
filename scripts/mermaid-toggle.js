
document.addEventListener('DOMContentLoaded', function () {
    // 找到所有 Mermaid 代码块
    const mermaidBlocks = document.querySelectorAll('pre.mermaid');

    mermaidBlocks.forEach(block => {
        const grandParentContainer = block.parentNode; // 包裹 <pre> 的父元素
        // 创建一个包裹器，将按钮、源码和图表都放在里面
        
        const wrapper = document.createElement('div');
        wrapper.classList.add('mermaid-container');
        wrapper.style.width = block.style.width;

        // 创建一个用于显示渲染图的 div
        const graphDiv = document.createElement('div');
        graphDiv.classList.add('mermaid-graph');
        graphDiv.innerHTML = block.innerHTML; // 初始时将源码放入，Mermaid 会渲染它

        // 创建源码显示区域
        const codeDiv = document.createElement('pre');
        codeDiv.classList.add('mermaid-code');
        // 使用 textContent 来确保 HTML 实体被正确显示
        codeDiv.textContent = block.textContent;

        // 创建切换按钮
        const toggleButton = document.createElement('button');
        toggleButton.classList.add('mermaid-toggle-button');
        toggleButton.textContent = '显示源码'; // 初始文本

        // 将元素添加到 wrapper
        wrapper.appendChild(toggleButton);
        wrapper.appendChild(graphDiv);
        wrapper.appendChild(codeDiv);

        // 替换原始的 <pre> 标签
        grandParentContainer.replaceChild(wrapper, block);

        // 绑定点击事件
        toggleButton.addEventListener('click', function () {
            if (graphDiv.style.display === 'none') {
                // 当前显示源码，切换到显示图
                graphDiv.style.display = 'block';
                codeDiv.style.display = 'none';
                toggleButton.textContent = '显示源码';
            } else {
                // 当前显示图，切换到显示源码
                graphDiv.style.display = 'none';
                codeDiv.style.display = 'block';
                toggleButton.textContent = '显示图表';
            }
        });
    });

    // 重新初始化 Mermaid，确保新的 .mermaid-graph 元素被渲染
    // 这一步很重要，因为 DOM 结构已经改变
    // 如果你在 Mermaid 初始化时使用了 startOnLoad: true，可能不需要再次调用
    // 但为了确保，这里可以再加一个延时调用，或者在Mermaid初始化后调用
    if (typeof mermaid !== 'undefined') {
        mermaid.init(undefined, '.mermaid-graph');
    }
});