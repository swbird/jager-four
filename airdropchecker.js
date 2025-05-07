import { readEvmAddressesAndKeys } from './utils.js';
import axios from 'axios';
import fs from 'fs/promises';

const API_BASE_URL = 'https://api.jager.meme/api/airdrop/queryAirdrop';

/**
 * 检查单个地址是否可以领取空投
 * @param {string} address - 要检查的地址
 * @returns {Promise<Object>} 检查结果
 */
async function checkAirdrop(address) {
    try {
        const response = await axios.get(`${API_BASE_URL}/${address}`);
        
        if (response.data.code === 200) {
            return {
                address,
                canAirdrop: response.data.data.canAirdrop,
                claimed: response.data.data.claimed,
                bscBnbBalance: response.data.data.bscBnbBalance,
                bscFourMemeTradingVol: response.data.data.bscFourMemeTradingVol,
                bscPancakeTradingVol: response.data.data.bscPancakeTradingVol
            };
        }
        throw new Error(`API返回错误: ${response.data.message}`);
    } catch (error) {
        console.error(`检查地址 ${address} 失败:`, error.message);
        return {
            address,
            canAirdrop: false,
            error: error.message
        };
    }
}

/**
 * 将结果写入文件
 * @param {Array} results - 检查结果数组
 */
async function writeResults(results) {
    try {
        const filename = 'airdrop_available.txt';
        const canAirdropResults = results.filter(r => r.canAirdrop);
        
        if (canAirdropResults.length === 0) {
            console.log('没有发现可领取空投的地址');
            return;
        }

        // 准备写入的内容
        let content = '';
        
        // 检查文件是否存在
        try {
            await fs.access(filename);
            // 文件存在，直接追加内容
            content = '\n'; // 添加换行符
        } catch {
            // 文件不存在，添加表头
            content = '地址,可领取空投,已领取,BNB余额,FourMeme交易量,Pancake交易量\n';
        }
        
        // 添加可领取空投的地址信息
        canAirdropResults.forEach(result => {
            content += `${result.address},${result.canAirdrop},${result.claimed || false},${result.bscBnbBalance || '0'},${result.bscFourMemeTradingVol || '0'},${result.bscPancakeTradingVol || '0'}\n`;
        });
        
        // 追加写入文件
        await fs.appendFile(filename, content);
        console.log(`发现 ${canAirdropResults.length} 个可领取空投的地址，已追加到文件: ${filename}`);
        
        // 打印可领取空投的地址
        console.log('\n可领取空投的地址:');
        canAirdropResults.forEach(result => {
            console.log(`地址: ${result.address}`);
            console.log(`BNB余额: ${result.bscBnbBalance}`);
            console.log(`FourMeme交易量: ${result.bscFourMemeTradingVol}`);
            console.log(`Pancake交易量: ${result.bscPancakeTradingVol}`);
            console.log('---');
        });
    } catch (error) {
        console.error('写入结果文件失败:', error);
    }
}

/**
 * 等待指定时间
 * @param {number} ms - 等待的毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主函数
 */
async function main() {
    try {
        // 读取地址列表
        const { addrs } = readEvmAddressesAndKeys('./addrs.txt');
        console.log(`开始检查 ${addrs.length} 个地址的空投状态`);
        
        const results = [];
        
        // 逐个检查地址
        for (let i = 0; i < addrs.length; i++) {
            const address = addrs[i];
            console.log(`\n检查第 ${i + 1}/${addrs.length} 个地址: ${address}`);
            
            try {
                const result = await checkAirdrop(address);
                results.push(result);
                
                // 打印检查结果
                console.log(`可领取空投: ${result.canAirdrop}`);
                if (result.canAirdrop) {
                    console.log(`BNB余额: ${result.bscBnbBalance}`);
                    console.log(`FourMeme交易量: ${result.bscFourMemeTradingVol}`);
                    console.log(`Pancake交易量: ${result.bscPancakeTradingVol}`);
                }
                
                // 等待1秒再检查下一个地址
                await sleep(1000);
            } catch (error) {
                console.error(`检查地址 ${address} 时出错:`, error);
                results.push({
                    address,
                    canAirdrop: false,
                    error: error.message
                });
            }
        }
        
        // 写入结果到文件
        await writeResults(results);
        
        // 打印统计信息
        const canAirdropCount = results.filter(r => r.canAirdrop).length;
        console.log('\n检查完成！');
        console.log(`总计检查: ${results.length} 个地址`);
        console.log(`可领取空投: ${canAirdropCount} 个地址`);
        
    } catch (error) {
        console.error('程序执行出错:', error);
    }
}

// 如果直接运行此文件，则执行main函数

main().catch(console.error);
