const fs = require('fs');

/**
 * 从文件中读取 EVM 地址和私钥
 * @param {string} filename - 文件名
 * @returns {Object} 包含地址和私钥的对象
 */
function readEvmAddressesAndKeys(filename) {
    try {
        // 读取文件内容
        const content = fs.readFileSync(filename, 'utf8');
        
        // EVM 地址正则表达式 (0x 开头，后跟 40 个十六进制字符)
        const addressRegex = /(0x[a-fA-F0-9]{40})(?![A-Fa-f0-9])/g;
        
        // 私钥正则表达式 (0x 开头，后跟 64 个十六进制字符)
        const privateKeyRegex = /0x[a-fA-F0-9]{64}/g;
        
        // 提取所有匹配项
        const addrs = content.match(addressRegex) || [];
        const secks = content.match(privateKeyRegex) || [];
        
        // 去重
        const uniqueAddrs = [...new Set(addrs)];
        const uniqueSecks = [...new Set(secks)];
        
        return {
            addrs: uniqueAddrs,
            secks: uniqueSecks
        };
    } catch (error) {
        console.error('读取文件失败:', error);
        return {
            addrs: [],
            secks: []
        };
    }
}

module.exports = {
    readEvmAddressesAndKeys
};
