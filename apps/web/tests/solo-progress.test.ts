import {test,expect} from 'bun:test';
import {restoreSoloUi,soloUiKey} from '../src/shared/lib/solo-progress';
const storage=(value:string|null)=>({getItem:()=>value}) as Storage;
test('resume restores the investigation phase but rejects stale evidence and suspect IDs',()=>{
 const saved={phase:'accuse',roomId:'pantry',selectedSuspect:'sa',accusation:['e1','missing','e1'],responses:[{text:'진술',source:'질문'}],openingIndex:3,hintIndex:{cross:2}};
 const result=restoreSoloUi(storage(JSON.stringify(saved)),'play',true,['e1'],['pantry'],['sa']);
 expect(result.phase).toBe('accuse');expect(result.selectedSuspect).toBe('sa');expect(result.accusation).toEqual(['e1']);expect(result.responses[0]?.text).toBe('진술');
 expect(soloUiKey('play')).not.toBe(soloUiKey('another'));
});
test('corrupt cache cannot jump an opening run into a later stage',()=>{
 const saved={phase:'win',roomId:'unknown',selectedSuspect:'intruder',accusation:['secret'],responses:[null,{text:4}],hintIndex:{cross:-1,other:99}};
 const result=restoreSoloUi(storage(JSON.stringify(saved)),'play',false,[],[],[]);
 expect(result.phase).toBe('intro');expect(result.accusation).toEqual([]);expect(result.responses).toEqual([]);expect(result.hintIndex).toEqual({});
 expect(restoreSoloUi(storage('{bad'),'play',true,[],[],[]).phase).toBe('explore');
});
