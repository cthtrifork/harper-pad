var e=Object.defineProperty,t=(t,n)=>{let r={};for(var i in t)e(r,i,{get:t[i],enumerable:!0});return n||e(r,Symbol.toStringTag,{value:`Module`}),r},n=/* @__PURE__ */ t({Dialect:()=>r,Language:()=>i,Lint:()=>a,Linter:()=>o,OrganizedGroup:()=>s,Span:()=>c,Suggestion:()=>l,SuggestionKind:()=>u,default:()=>Ce,get_default_lint_config:()=>d,get_default_lint_config_as_json:()=>ee,initSync:()=>Se,setup:()=>te,to_title_case:()=>ne}),r=Object.freeze({American:0,0:`American`,British:1,1:`British`,Australian:2,2:`Australian`,Canadian:3,3:`Canadian`,Indian:4,4:`Indian`}),i=Object.freeze({Plain:0,0:`Plain`,Markdown:1,1:`Markdown`,Typst:2,2:`Typst`}),a=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,ie.register(n,n.__wbg_ptr,n),n}static __unwrap(t){return t instanceof e?t.__destroy_into_raw():0}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,ie.unregister(this),e}free(){let e=this.__destroy_into_raw();E.__wbg_lint_free(e,0)}static from_json(t){let n=x(t,E.__wbindgen_malloc,E.__wbindgen_realloc),r=E.lint_from_json(n,T);if(r[2])throw S(r[1]);return e.__wrap(r[0])}get_problem_text(){let e,t;try{let n=E.lint_get_problem_text(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}lint_kind(){let e,t;try{let n=E.lint_lint_kind(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}lint_kind_pretty(){let e,t;try{let n=E.lint_lint_kind_pretty(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}message(){let e,t;try{let n=E.lint_message(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}message_html(){let e,t;try{let n=E.lint_message_html(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}span(){let e=E.lint_span(this.__wbg_ptr);return c.__wrap(e)}suggestion_count(){return E.lint_suggestion_count(this.__wbg_ptr)>>>0}suggestions(){let e=E.lint_suggestions(this.__wbg_ptr);var t=f(e[0],e[1]);return E.__wbindgen_free(e[0],e[1]*4,4),t}to_json(){let e,t;try{let n=E.lint_to_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(a.prototype[Symbol.dispose]=a.prototype.free);var o=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,ae.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,ae.unregister(this),e}free(){let e=this.__destroy_into_raw();E.__wbg_linter_free(e,0)}apply_suggestion(e,t,n){let r,i;try{let c=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),u=T;ue(t,a),ue(n,l);let d=E.linter_apply_suggestion(this.__wbg_ptr,c,u,t.__wbg_ptr,n.__wbg_ptr);var o=d[0],s=d[1];if(d[3])throw o=0,s=0,S(d[2]);return r=o,i=s,g(o,s)}finally{E.__wbindgen_free(r,i,1)}}clear_ignored_lints(){E.linter_clear_ignored_lints(this.__wbg_ptr)}clear_words(){E.linter_clear_words(this.__wbg_ptr)}context_hash(e,t){let n=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),r=T;ue(t,a);let i=E.linter_context_hash(this.__wbg_ptr,n,r,t.__wbg_ptr);return BigInt.asUintN(64,i)}export_ignored_lints(){let e,t;try{let n=E.linter_export_ignored_lints(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}export_words(){let e=E.linter_export_words(this.__wbg_ptr);var t=f(e[0],e[1]);return E.__wbindgen_free(e[0],e[1]*4,4),t}generate_stats_file(){let e,t;try{let n=E.linter_generate_stats_file(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}get_dialect(){return E.linter_get_dialect(this.__wbg_ptr)}get_lint_config_as_json(){let e,t;try{let n=E.linter_get_lint_config_as_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}get_lint_config_as_object(){return E.linter_get_lint_config_as_object(this.__wbg_ptr)}get_lint_descriptions_as_json(){let e,t;try{let n=E.linter_get_lint_descriptions_as_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}get_lint_descriptions_as_object(){return E.linter_get_lint_descriptions_as_object(this.__wbg_ptr)}get_lint_descriptions_html_as_json(){let e,t;try{let n=E.linter_get_lint_descriptions_html_as_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}get_lint_descriptions_html_as_object(){return E.linter_get_lint_descriptions_html_as_object(this.__wbg_ptr)}get_structured_lint_config_as_json(){let e,t;try{let n=E.linter_get_structured_lint_config_as_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}get_structured_lint_config_as_object(){return E.linter_get_structured_lint_config_as_object(this.__wbg_ptr)}ignore_hashes(e){let t=me(e,E.__wbindgen_malloc),n=T;E.linter_ignore_hashes(this.__wbg_ptr,t,n)}ignore_lints(e,t){let n=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),r=T,i=ge(t,E.__wbindgen_malloc),a=T;E.linter_ignore_lints(this.__wbg_ptr,n,r,i,a)}import_ignored_lints(e){let t=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),n=T,r=E.linter_import_ignored_lints(this.__wbg_ptr,t,n);if(r[1])throw S(r[0])}import_stats_file(e){let t=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),n=T,r=E.linter_import_stats_file(this.__wbg_ptr,t,n);if(r[1])throw S(r[0])}import_weirpack(e){let t=he(e,E.__wbindgen_malloc),n=T,r=E.linter_import_weirpack(this.__wbg_ptr,t,n);if(r[2])throw S(r[1]);return S(r[0])}import_words(e){let t=ge(e,E.__wbindgen_malloc),n=T;E.linter_import_words(this.__wbg_ptr,t,n)}is_likely_english(e){let t=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),n=T;return E.linter_is_likely_english(this.__wbg_ptr,t,n)!==0}isolate_english(e){let t,n;try{let r=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),i=T,a=E.linter_isolate_english(this.__wbg_ptr,r,i);return t=a[0],n=a[1],g(a[0],a[1])}finally{E.__wbindgen_free(t,n,1)}}lint(e,t,n,r,i,a){let o=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),s=T;var c=b(r)?0:x(r,E.__wbindgen_malloc,E.__wbindgen_realloc),l=T;let u=E.linter_lint(this.__wbg_ptr,o,s,t,n,c,l,i,a);var d=f(u[0],u[1]);return E.__wbindgen_free(u[0],u[1]*4,4),d}static new(t){let n=E.linter_new(t);return e.__wrap(n)}organized_lints(e,t,n,r,i,a){let o=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),s=T;var c=b(r)?0:x(r,E.__wbindgen_malloc,E.__wbindgen_realloc),l=T;let u=E.linter_organized_lints(this.__wbg_ptr,o,s,t,n,c,l,i,a);var d=f(u[0],u[1]);return E.__wbindgen_free(u[0],u[1]*4,4),d}set_lint_config_from_json(e){let t=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),n=T,r=E.linter_set_lint_config_from_json(this.__wbg_ptr,t,n);if(r[1])throw S(r[0])}set_lint_config_from_object(e){let t=E.linter_set_lint_config_from_object(this.__wbg_ptr,e);if(t[1])throw S(t[0])}summarize_stats(e,t){return E.linter_summarize_stats(this.__wbg_ptr,!b(e),b(e)?BigInt(0):e,!b(t),b(t)?BigInt(0):t)}};Symbol.dispose&&(o.prototype[Symbol.dispose]=o.prototype.free);var s=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,oe.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,oe.unregister(this),e}free(){let e=this.__destroy_into_raw();E.__wbg_organizedgroup_free(e,0)}get group(){let e,t;try{let n=E.__wbg_get_organizedgroup_group(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}get lints(){let e=E.__wbg_get_organizedgroup_lints(this.__wbg_ptr);var t=f(e[0],e[1]);return E.__wbindgen_free(e[0],e[1]*4,4),t}set group(e){let t=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),n=T;E.__wbg_set_organizedgroup_group(this.__wbg_ptr,t,n)}set lints(e){let t=ge(e,E.__wbindgen_malloc),n=T;E.__wbg_set_organizedgroup_lints(this.__wbg_ptr,t,n)}};Symbol.dispose&&(s.prototype[Symbol.dispose]=s.prototype.free);var c=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,se.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,se.unregister(this),e}free(){let e=this.__destroy_into_raw();E.__wbg_span_free(e,0)}get end(){return E.__wbg_get_span_end(this.__wbg_ptr)>>>0}get start(){return E.__wbg_get_span_start(this.__wbg_ptr)>>>0}set end(e){E.__wbg_set_span_end(this.__wbg_ptr,e)}set start(e){E.__wbg_set_span_start(this.__wbg_ptr,e)}static from_json(t){let n=x(t,E.__wbindgen_malloc,E.__wbindgen_realloc),r=E.span_from_json(n,T);if(r[2])throw S(r[1]);return e.__wrap(r[0])}is_empty(){return E.span_is_empty(this.__wbg_ptr)!==0}len(){return E.span_len(this.__wbg_ptr)>>>0}static new(t,n){let r=E.span_new(t,n);return e.__wrap(r)}to_json(){let e,t;try{let n=E.span_to_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(c.prototype[Symbol.dispose]=c.prototype.free);var l=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,ce.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,ce.unregister(this),e}free(){let e=this.__destroy_into_raw();E.__wbg_suggestion_free(e,0)}static from_json(t){let n=x(t,E.__wbindgen_malloc,E.__wbindgen_realloc),r=E.suggestion_from_json(n,T);if(r[2])throw S(r[1]);return e.__wrap(r[0])}get_replacement_text(){let e,t;try{let n=E.suggestion_get_replacement_text(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}kind(){return E.suggestion_kind(this.__wbg_ptr)}to_json(){let e,t;try{let n=E.suggestion_to_json(this.__wbg_ptr);return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(l.prototype[Symbol.dispose]=l.prototype.free);var u=Object.freeze({Replace:0,0:`Replace`,Remove:1,1:`Remove`,InsertAfter:2,2:`InsertAfter`});function d(){return E.get_default_lint_config()}function ee(){let e,t;try{let n=E.get_default_lint_config_as_json();return e=n[0],t=n[1],g(n[0],n[1])}finally{E.__wbindgen_free(e,t,1)}}function te(){E.setup()}function ne(e){let t,n;try{let r=x(e,E.__wbindgen_malloc,E.__wbindgen_realloc),i=E.to_title_case(r,T);return t=i[0],n=i[1],g(i[0],i[1])}finally{E.__wbindgen_free(t,n,1)}}function re(){return{__proto__:null,"./harper_wasm_slim_bg.js":{__proto__:null,__wbg_Error_30c8987f7c2ed4e2:function(e,t){return Error(g(e,t))},__wbg_String_8564e559799eccda:function(e,t){let n=x(String(t),E.__wbindgen_malloc,E.__wbindgen_realloc),r=T;h().setInt32(e+4,r,!0),h().setInt32(e+0,n,!0)},__wbg___wbindgen_boolean_get_5b446f51afd21013:function(e){let t=e,n=typeof t==`boolean`?t:void 0;return b(n)?16777215:+!!n},__wbg___wbindgen_debug_string_4687d8d8c2017d52:function(e,t){let n=x(de(t),E.__wbindgen_malloc,E.__wbindgen_realloc),r=T;h().setInt32(e+4,r,!0),h().setInt32(e+0,n,!0)},__wbg___wbindgen_is_function_1f9d30630b8b1d3d:function(e){return typeof e==`function`},__wbg___wbindgen_is_object_3c45d4f2dde4e749:function(e){let t=e;return typeof t==`object`&&!!t},__wbg___wbindgen_is_string_90b56bc79aad6f6c:function(e){return typeof e==`string`},__wbg___wbindgen_jsval_loose_eq_677f21e468d6b461:function(e,t){return e==t},__wbg___wbindgen_number_get_2e0e7dee9f701a71:function(e,t){let n=t,r=typeof n==`number`?n:void 0;h().setFloat64(e+8,b(r)?0:r,!0),h().setInt32(e+0,!b(r),!0)},__wbg___wbindgen_string_get_0380ccaa2f57f0d9:function(e,t){let n=t,r=typeof n==`string`?n:void 0;var i=b(r)?0:x(r,E.__wbindgen_malloc,E.__wbindgen_realloc),a=T;h().setInt32(e+4,a,!0),h().setInt32(e+0,i,!0)},__wbg___wbindgen_throw_41e9ee4f547fc59a:function(e,t){throw Error(g(e,t))},__wbg_call_6137034ef55c9d0f:function(){return y(function(e,t){return e.call(t)},arguments)},__wbg_done_b41a1d26cdb37fb6:function(e){return e.done},__wbg_entries_fb6397112b1de25f:function(e){return Object.entries(e)},__wbg_error_757e9472f8410341:function(e,t){let n,r;try{n=e,r=t,console.error(g(e,t))}finally{E.__wbindgen_free(n,r,1)}},__wbg_getRandomValues_973dabfb0ad1769f:function(){return y(function(e,t){globalThis.crypto.getRandomValues(fe(e,t))},arguments)},__wbg_getRandomValues_a608c4436c19407a:function(){return y(function(e,t){globalThis.crypto.getRandomValues(fe(e,t))},arguments)},__wbg_getTime_f5a55efff2585d5d:function(e){return e.getTime()},__wbg_get_658f6698067d9515:function(){return y(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_6c896e0571ddae51:function(e,t){return e[t>>>0]},__wbg_get_unchecked_288889d017702237:function(e,t){return e[t>>>0]},__wbg_instanceof_ArrayBuffer_a99f175873e5d9b8:function(e){let t;try{t=e instanceof ArrayBuffer}catch{t=!1}return t},__wbg_instanceof_Uint8Array_828cef2aaacafc31:function(e){let t;try{t=e instanceof Uint8Array}catch{t=!1}return t},__wbg_iterator_e3c31c892080e444:function(){return Symbol.iterator},__wbg_length_7f3c00c40364105e:function(e){return e.length},__wbg_length_d4bdea10311bd9cf:function(e){return e.length},__wbg_lint_new:function(e){return a.__wrap(e)},__wbg_lint_unwrap:function(e){return a.__unwrap(e)},__wbg_log_1f8cbb01c83d06c2:function(e,t,n,r,i,a,o,s){let c,l;try{c=e,l=t,console.log(g(e,t),g(n,r),g(i,a),g(o,s))}finally{E.__wbindgen_free(c,l,1)}},__wbg_log_a54ca6b45e09078a:function(e,t){let n,r;try{n=e,r=t,console.log(g(e,t))}finally{E.__wbindgen_free(n,r,1)}},__wbg_mark_6b7f03786f5e4d61:function(e,t){performance.mark(g(e,t))},__wbg_measure_0e21b33a1c6e3a29:function(){return y(function(e,t,n,r){let i,a,o,s;try{i=e,a=t,o=n,s=r,performance.measure(g(e,t),g(n,r))}finally{E.__wbindgen_free(i,a,1),E.__wbindgen_free(o,s,1)}},arguments)},__wbg_new_0_72d020f0c63443d4:function(){return/* @__PURE__ */ new Date},__wbg_new_1dbf7428bba60a42:function(e){return new Uint8Array(e)},__wbg_new_227d7c05414eb861:function(){return/* @__PURE__ */ Error()},__wbg_new_28744009d011f847:function(){return/* @__PURE__ */ new Map},__wbg_new_617a8cdb8bb1130e:function(){return{}},__wbg_new_ee2291f50781bf1d:function(){return[]},__wbg_next_33784799010f1bbe:function(e){return e.next},__wbg_next_f4aac29c42af995c:function(){return y(function(e){return e.next()},arguments)},__wbg_organizedgroup_new:function(e){return s.__wrap(e)},__wbg_prototypesetcall_bc27214492979395:function(e,t,n){Uint8Array.prototype.set.call(fe(e,t),n)},__wbg_set_6ae97e73113c4f0b:function(e,t,n){return e.set(t,n)},__wbg_set_6be42768c690e380:function(e,t,n){e[t]=n},__wbg_set_bea140a88be9b277:function(e,t,n){e[t>>>0]=n},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=x(n,E.__wbindgen_malloc,E.__wbindgen_realloc),i=T;h().setInt32(e+4,i,!0),h().setInt32(e+0,r,!0)},__wbg_suggestion_new:function(e){return l.__wrap(e)},__wbg_value_f3c585ee8f5ba40c:function(e){return e.value},__wbindgen_generic_0000000000000001:function(e){return e},__wbindgen_generic_0000000000000002:function(e,t){return g(e,t)},__wbindgen_init_externref_table:function(){let e=E.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}var ie=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>E.__wbg_lint_free(e,1)),ae=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>E.__wbg_linter_free(e,1)),oe=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>E.__wbg_organizedgroup_free(e,1)),se=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>E.__wbg_span_free(e,1)),ce=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>E.__wbg_suggestion_free(e,1));function le(e){let t=E.__externref_table_alloc();return E.__wbindgen_externrefs.set(t,e),t}function ue(e,t){if(!(e instanceof t))throw Error(`expected instance of ${t.name}`)}function de(e){let t=typeof e;if(t==`number`||t==`boolean`||e==null)return`${e}`;if(t==`string`)return`"${e}"`;if(t==`symbol`){let t=e.description;return t==null?`Symbol`:`Symbol(${t})`}if(t==`function`){let t=e.name;return typeof t==`string`&&t.length>0?`Function(${t})`:`Function`}if(Array.isArray(e)){let t=e.length,n=`[`;t>0&&(n+=de(e[0]));for(let r=1;r<t;r++)n+=`, `+de(e[r]);return n+=`]`,n}let n=/\[object ([^\]]+)\]/.exec(toString.call(e)),r;if(n&&n.length>1)r=n[1];else return toString.call(e);if(r==`Object`)try{return`Object(`+JSON.stringify(e)+`)`}catch{return`Object`}return e instanceof Error?`${e.name}: ${e.message}\n${e.stack}`:r}function f(e,t){e>>>=0;let n=h(),r=[];for(let i=e;i<e+4*t;i+=4)r.push(E.__wbindgen_externrefs.get(n.getUint32(i,!0)));return E.__externref_drop_slice(e,t),r}function fe(e,t){return e>>>=0,v().subarray(e/1,e/1+t)}var p=null;function pe(){return(p===null||p.byteLength===0)&&(p=new BigUint64Array(E.memory.buffer)),p}var m=null;function h(){return(m===null||m.buffer.detached===!0||m.buffer.detached===void 0&&m.buffer!==E.memory.buffer)&&(m=new DataView(E.memory.buffer)),m}function g(e,t){return ye(e>>>0,t)}var _=null;function v(){return(_===null||_.byteLength===0)&&(_=new Uint8Array(E.memory.buffer)),_}function y(e,t){try{return e.apply(this,t)}catch(e){let t=le(e);E.__wbindgen_exn_store(t)}}function b(e){return e==null}function me(e,t){let n=t(e.length*8,8)>>>0;return pe().set(e,n/8),T=e.length,n}function he(e,t){let n=t(e.length*1,1)>>>0;return v().set(e,n/1),T=e.length,n}function ge(e,t){let n=t(e.length*4,4)>>>0;for(let t=0;t<e.length;t++){let r=le(e[t]);h().setUint32(n+4*t,r,!0)}return T=e.length,n}function x(e,t,n){if(n===void 0){let n=w.encode(e),r=t(n.length,1)>>>0;return v().subarray(r,r+n.length).set(n),T=n.length,r}let r=e.length,i=t(r,1)>>>0,a=v(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=v().subarray(i+o,i+r),a=w.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return T=o,i}function S(e){let t=E.__wbindgen_externrefs.get(e);return E.__externref_table_dealloc(e),t}var C=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});C.decode();var _e=2146435072,ve=0;function ye(e,t){return ve+=t,ve>=_e&&(C=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),C.decode(),ve=t),C.decode(v().subarray(e,e+t))}var w=new TextEncoder;`encodeInto`in w||(w.encodeInto=function(e,t){let n=w.encode(e);return t.set(n),{read:e.length,written:n.length}});var T=0,E;function be(e,t){return E=e.exports,p=null,m=null,_=null,E.__wbindgen_start(),E}async function xe(e,t){if(typeof Response==`function`&&e instanceof Response){if(!e.ok)throw Error(`failed to fetch Wasm: ${e.status} ${e.statusText} fetching '${e.url}'`);if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}function Se(e){if(E!==void 0)return E;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module:e}=e:console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));let t=re();return e instanceof WebAssembly.Module||(e=new WebAssembly.Module(e)),be(new WebAssembly.Instance(e,t),e)}async function Ce(e){if(E!==void 0)return E;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`)),e===void 0&&(e=new URL);let t=re();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:n,module:r}=await xe(await e,t);return be(n,r)}var we=/* @__PURE__ */ t({Dialect:()=>Te,Language:()=>Ee,Lint:()=>D,Linter:()=>O,OrganizedGroup:()=>k,Span:()=>A,Suggestion:()=>j,SuggestionKind:()=>De,default:()=>Xe,get_default_lint_config:()=>Oe,get_default_lint_config_as_json:()=>ke,initSync:()=>Ye,setup:()=>Ae,to_title_case:()=>je}),Te=Object.freeze({American:0,0:`American`,British:1,1:`British`,Australian:2,2:`Australian`,Canadian:3,3:`Canadian`,Indian:4,4:`Indian`}),Ee=Object.freeze({Plain:0,0:`Plain`,Markdown:1,1:`Markdown`,Typst:2,2:`Typst`}),D=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,Ne.register(n,n.__wbg_ptr,n),n}static __unwrap(t){return t instanceof e?t.__destroy_into_raw():0}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Ne.unregister(this),e}free(){let e=this.__destroy_into_raw();J.__wbg_lint_free(e,0)}static from_json(t){let n=U(t,J.__wbindgen_malloc,J.__wbindgen_realloc),r=J.lint_from_json(n,q);if(r[2])throw W(r[1]);return e.__wrap(r[0])}get_problem_text(){let e,t;try{let n=J.lint_get_problem_text(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}lint_kind(){let e,t;try{let n=J.lint_lint_kind(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}lint_kind_pretty(){let e,t;try{let n=J.lint_lint_kind_pretty(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}message(){let e,t;try{let n=J.lint_message(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}message_html(){let e,t;try{let n=J.lint_message_html(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}span(){let e=J.lint_span(this.__wbg_ptr);return A.__wrap(e)}suggestion_count(){return J.lint_suggestion_count(this.__wbg_ptr)>>>0}suggestions(){let e=J.lint_suggestions(this.__wbg_ptr);var t=N(e[0],e[1]);return J.__wbindgen_free(e[0],e[1]*4,4),t}to_json(){let e,t;try{let n=J.lint_to_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(D.prototype[Symbol.dispose]=D.prototype.free);var O=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,Pe.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Pe.unregister(this),e}free(){let e=this.__destroy_into_raw();J.__wbg_linter_free(e,0)}apply_suggestion(e,t,n){let r,i;try{let s=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),c=q;M(t,D),M(n,j);let l=J.linter_apply_suggestion(this.__wbg_ptr,s,c,t.__wbg_ptr,n.__wbg_ptr);var a=l[0],o=l[1];if(l[3])throw a=0,o=0,W(l[2]);return r=a,i=o,L(a,o)}finally{J.__wbindgen_free(r,i,1)}}clear_ignored_lints(){J.linter_clear_ignored_lints(this.__wbg_ptr)}clear_words(){J.linter_clear_words(this.__wbg_ptr)}context_hash(e,t){let n=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),r=q;M(t,D);let i=J.linter_context_hash(this.__wbg_ptr,n,r,t.__wbg_ptr);return BigInt.asUintN(64,i)}export_ignored_lints(){let e,t;try{let n=J.linter_export_ignored_lints(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}export_words(){let e=J.linter_export_words(this.__wbg_ptr);var t=N(e[0],e[1]);return J.__wbindgen_free(e[0],e[1]*4,4),t}generate_stats_file(){let e,t;try{let n=J.linter_generate_stats_file(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}get_dialect(){return J.linter_get_dialect(this.__wbg_ptr)}get_lint_config_as_json(){let e,t;try{let n=J.linter_get_lint_config_as_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}get_lint_config_as_object(){return J.linter_get_lint_config_as_object(this.__wbg_ptr)}get_lint_descriptions_as_json(){let e,t;try{let n=J.linter_get_lint_descriptions_as_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}get_lint_descriptions_as_object(){return J.linter_get_lint_descriptions_as_object(this.__wbg_ptr)}get_lint_descriptions_html_as_json(){let e,t;try{let n=J.linter_get_lint_descriptions_html_as_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}get_lint_descriptions_html_as_object(){return J.linter_get_lint_descriptions_html_as_object(this.__wbg_ptr)}get_structured_lint_config_as_json(){let e,t;try{let n=J.linter_get_structured_lint_config_as_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}get_structured_lint_config_as_object(){return J.linter_get_structured_lint_config_as_object(this.__wbg_ptr)}ignore_hashes(e){let t=He(e,J.__wbindgen_malloc),n=q;J.linter_ignore_hashes(this.__wbg_ptr,t,n)}ignore_lints(e,t){let n=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),r=q,i=H(t,J.__wbindgen_malloc),a=q;J.linter_ignore_lints(this.__wbg_ptr,n,r,i,a)}import_ignored_lints(e){let t=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),n=q,r=J.linter_import_ignored_lints(this.__wbg_ptr,t,n);if(r[1])throw W(r[0])}import_stats_file(e){let t=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),n=q,r=J.linter_import_stats_file(this.__wbg_ptr,t,n);if(r[1])throw W(r[0])}import_weirpack(e){let t=Ue(e,J.__wbindgen_malloc),n=q,r=J.linter_import_weirpack(this.__wbg_ptr,t,n);if(r[2])throw W(r[1]);return W(r[0])}import_words(e){let t=H(e,J.__wbindgen_malloc),n=q;J.linter_import_words(this.__wbg_ptr,t,n)}is_likely_english(e){let t=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),n=q;return J.linter_is_likely_english(this.__wbg_ptr,t,n)!==0}isolate_english(e){let t,n;try{let r=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),i=q,a=J.linter_isolate_english(this.__wbg_ptr,r,i);return t=a[0],n=a[1],L(a[0],a[1])}finally{J.__wbindgen_free(t,n,1)}}lint(e,t,n,r,i,a){let o=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),s=q;var c=V(r)?0:U(r,J.__wbindgen_malloc,J.__wbindgen_realloc),l=q;let u=J.linter_lint(this.__wbg_ptr,o,s,t,n,c,l,i,a);var d=N(u[0],u[1]);return J.__wbindgen_free(u[0],u[1]*4,4),d}static new(t){let n=J.linter_new(t);return e.__wrap(n)}organized_lints(e,t,n,r,i,a){let o=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),s=q;var c=V(r)?0:U(r,J.__wbindgen_malloc,J.__wbindgen_realloc),l=q;let u=J.linter_organized_lints(this.__wbg_ptr,o,s,t,n,c,l,i,a);var d=N(u[0],u[1]);return J.__wbindgen_free(u[0],u[1]*4,4),d}set_lint_config_from_json(e){let t=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),n=q,r=J.linter_set_lint_config_from_json(this.__wbg_ptr,t,n);if(r[1])throw W(r[0])}set_lint_config_from_object(e){let t=J.linter_set_lint_config_from_object(this.__wbg_ptr,e);if(t[1])throw W(t[0])}summarize_stats(e,t){return J.linter_summarize_stats(this.__wbg_ptr,!V(e),V(e)?BigInt(0):e,!V(t),V(t)?BigInt(0):t)}};Symbol.dispose&&(O.prototype[Symbol.dispose]=O.prototype.free);var k=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,Fe.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Fe.unregister(this),e}free(){let e=this.__destroy_into_raw();J.__wbg_organizedgroup_free(e,0)}get group(){let e,t;try{let n=J.__wbg_get_organizedgroup_group(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}get lints(){let e=J.__wbg_get_organizedgroup_lints(this.__wbg_ptr);var t=N(e[0],e[1]);return J.__wbindgen_free(e[0],e[1]*4,4),t}set group(e){let t=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),n=q;J.__wbg_set_organizedgroup_group(this.__wbg_ptr,t,n)}set lints(e){let t=H(e,J.__wbindgen_malloc),n=q;J.__wbg_set_organizedgroup_lints(this.__wbg_ptr,t,n)}};Symbol.dispose&&(k.prototype[Symbol.dispose]=k.prototype.free);var A=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,Ie.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Ie.unregister(this),e}free(){let e=this.__destroy_into_raw();J.__wbg_span_free(e,0)}get end(){return J.__wbg_get_span_end(this.__wbg_ptr)>>>0}get start(){return J.__wbg_get_span_start(this.__wbg_ptr)>>>0}set end(e){J.__wbg_set_span_end(this.__wbg_ptr,e)}set start(e){J.__wbg_set_span_start(this.__wbg_ptr,e)}static from_json(t){let n=U(t,J.__wbindgen_malloc,J.__wbindgen_realloc),r=J.span_from_json(n,q);if(r[2])throw W(r[1]);return e.__wrap(r[0])}is_empty(){return J.span_is_empty(this.__wbg_ptr)!==0}len(){return J.span_len(this.__wbg_ptr)>>>0}static new(t,n){let r=J.span_new(t,n);return e.__wrap(r)}to_json(){let e,t;try{let n=J.span_to_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(A.prototype[Symbol.dispose]=A.prototype.free);var j=class e{static __wrap(t){let n=Object.create(e.prototype);return n.__wbg_ptr=t,Le.register(n,n.__wbg_ptr,n),n}__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,Le.unregister(this),e}free(){let e=this.__destroy_into_raw();J.__wbg_suggestion_free(e,0)}static from_json(t){let n=U(t,J.__wbindgen_malloc,J.__wbindgen_realloc),r=J.suggestion_from_json(n,q);if(r[2])throw W(r[1]);return e.__wrap(r[0])}get_replacement_text(){let e,t;try{let n=J.suggestion_get_replacement_text(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}kind(){return J.suggestion_kind(this.__wbg_ptr)}to_json(){let e,t;try{let n=J.suggestion_to_json(this.__wbg_ptr);return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(j.prototype[Symbol.dispose]=j.prototype.free);var De=Object.freeze({Replace:0,0:`Replace`,Remove:1,1:`Remove`,InsertAfter:2,2:`InsertAfter`});function Oe(){return J.get_default_lint_config()}function ke(){let e,t;try{let n=J.get_default_lint_config_as_json();return e=n[0],t=n[1],L(n[0],n[1])}finally{J.__wbindgen_free(e,t,1)}}function Ae(){J.setup()}function je(e){let t,n;try{let r=U(e,J.__wbindgen_malloc,J.__wbindgen_realloc),i=J.to_title_case(r,q);return t=i[0],n=i[1],L(i[0],i[1])}finally{J.__wbindgen_free(t,n,1)}}function Me(){return{__proto__:null,"./harper_wasm_bg.js":{__proto__:null,__wbg_Error_30c8987f7c2ed4e2:function(e,t){return Error(L(e,t))},__wbg_String_8564e559799eccda:function(e,t){let n=U(String(t),J.__wbindgen_malloc,J.__wbindgen_realloc),r=q;I().setInt32(e+4,r,!0),I().setInt32(e+0,n,!0)},__wbg___wbindgen_boolean_get_5b446f51afd21013:function(e){let t=e,n=typeof t==`boolean`?t:void 0;return V(n)?16777215:+!!n},__wbg___wbindgen_debug_string_4687d8d8c2017d52:function(e,t){let n=U(ze(t),J.__wbindgen_malloc,J.__wbindgen_realloc),r=q;I().setInt32(e+4,r,!0),I().setInt32(e+0,n,!0)},__wbg___wbindgen_is_function_1f9d30630b8b1d3d:function(e){return typeof e==`function`},__wbg___wbindgen_is_object_3c45d4f2dde4e749:function(e){let t=e;return typeof t==`object`&&!!t},__wbg___wbindgen_is_string_90b56bc79aad6f6c:function(e){return typeof e==`string`},__wbg___wbindgen_jsval_loose_eq_677f21e468d6b461:function(e,t){return e==t},__wbg___wbindgen_number_get_2e0e7dee9f701a71:function(e,t){let n=t,r=typeof n==`number`?n:void 0;I().setFloat64(e+8,V(r)?0:r,!0),I().setInt32(e+0,!V(r),!0)},__wbg___wbindgen_string_get_0380ccaa2f57f0d9:function(e,t){let n=t,r=typeof n==`string`?n:void 0;var i=V(r)?0:U(r,J.__wbindgen_malloc,J.__wbindgen_realloc),a=q;I().setInt32(e+4,a,!0),I().setInt32(e+0,i,!0)},__wbg___wbindgen_throw_41e9ee4f547fc59a:function(e,t){throw Error(L(e,t))},__wbg_call_6137034ef55c9d0f:function(){return B(function(e,t){return e.call(t)},arguments)},__wbg_done_b41a1d26cdb37fb6:function(e){return e.done},__wbg_entries_fb6397112b1de25f:function(e){return Object.entries(e)},__wbg_error_757e9472f8410341:function(e,t){let n,r;try{n=e,r=t,console.error(L(e,t))}finally{J.__wbindgen_free(n,r,1)}},__wbg_getRandomValues_973dabfb0ad1769f:function(){return B(function(e,t){globalThis.crypto.getRandomValues(Be(e,t))},arguments)},__wbg_getRandomValues_a608c4436c19407a:function(){return B(function(e,t){globalThis.crypto.getRandomValues(Be(e,t))},arguments)},__wbg_getTime_f5a55efff2585d5d:function(e){return e.getTime()},__wbg_get_658f6698067d9515:function(){return B(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_6c896e0571ddae51:function(e,t){return e[t>>>0]},__wbg_get_unchecked_288889d017702237:function(e,t){return e[t>>>0]},__wbg_instanceof_ArrayBuffer_a99f175873e5d9b8:function(e){let t;try{t=e instanceof ArrayBuffer}catch{t=!1}return t},__wbg_instanceof_Uint8Array_828cef2aaacafc31:function(e){let t;try{t=e instanceof Uint8Array}catch{t=!1}return t},__wbg_iterator_e3c31c892080e444:function(){return Symbol.iterator},__wbg_length_7f3c00c40364105e:function(e){return e.length},__wbg_length_d4bdea10311bd9cf:function(e){return e.length},__wbg_lint_new:function(e){return D.__wrap(e)},__wbg_lint_unwrap:function(e){return D.__unwrap(e)},__wbg_log_1f8cbb01c83d06c2:function(e,t,n,r,i,a,o,s){let c,l;try{c=e,l=t,console.log(L(e,t),L(n,r),L(i,a),L(o,s))}finally{J.__wbindgen_free(c,l,1)}},__wbg_log_a54ca6b45e09078a:function(e,t){let n,r;try{n=e,r=t,console.log(L(e,t))}finally{J.__wbindgen_free(n,r,1)}},__wbg_mark_6b7f03786f5e4d61:function(e,t){performance.mark(L(e,t))},__wbg_measure_0e21b33a1c6e3a29:function(){return B(function(e,t,n,r){let i,a,o,s;try{i=e,a=t,o=n,s=r,performance.measure(L(e,t),L(n,r))}finally{J.__wbindgen_free(i,a,1),J.__wbindgen_free(o,s,1)}},arguments)},__wbg_new_0_72d020f0c63443d4:function(){return/* @__PURE__ */ new Date},__wbg_new_1dbf7428bba60a42:function(e){return new Uint8Array(e)},__wbg_new_227d7c05414eb861:function(){return/* @__PURE__ */ Error()},__wbg_new_28744009d011f847:function(){return/* @__PURE__ */ new Map},__wbg_new_617a8cdb8bb1130e:function(){return{}},__wbg_new_ee2291f50781bf1d:function(){return[]},__wbg_next_33784799010f1bbe:function(e){return e.next},__wbg_next_f4aac29c42af995c:function(){return B(function(e){return e.next()},arguments)},__wbg_organizedgroup_new:function(e){return k.__wrap(e)},__wbg_prototypesetcall_bc27214492979395:function(e,t,n){Uint8Array.prototype.set.call(Be(e,t),n)},__wbg_set_6ae97e73113c4f0b:function(e,t,n){return e.set(t,n)},__wbg_set_6be42768c690e380:function(e,t,n){e[t]=n},__wbg_set_bea140a88be9b277:function(e,t,n){e[t>>>0]=n},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=U(n,J.__wbindgen_malloc,J.__wbindgen_realloc),i=q;I().setInt32(e+4,i,!0),I().setInt32(e+0,r,!0)},__wbg_suggestion_new:function(e){return j.__wrap(e)},__wbg_value_f3c585ee8f5ba40c:function(e){return e.value},__wbindgen_generic_0000000000000001:function(e){return e},__wbindgen_generic_0000000000000002:function(e,t){return L(e,t)},__wbindgen_init_externref_table:function(){let e=J.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}var Ne=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>J.__wbg_lint_free(e,1)),Pe=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>J.__wbg_linter_free(e,1)),Fe=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>J.__wbg_organizedgroup_free(e,1)),Ie=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>J.__wbg_span_free(e,1)),Le=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>J.__wbg_suggestion_free(e,1));function Re(e){let t=J.__externref_table_alloc();return J.__wbindgen_externrefs.set(t,e),t}function M(e,t){if(!(e instanceof t))throw Error(`expected instance of ${t.name}`)}function ze(e){let t=typeof e;if(t==`number`||t==`boolean`||e==null)return`${e}`;if(t==`string`)return`"${e}"`;if(t==`symbol`){let t=e.description;return t==null?`Symbol`:`Symbol(${t})`}if(t==`function`){let t=e.name;return typeof t==`string`&&t.length>0?`Function(${t})`:`Function`}if(Array.isArray(e)){let t=e.length,n=`[`;t>0&&(n+=ze(e[0]));for(let r=1;r<t;r++)n+=`, `+ze(e[r]);return n+=`]`,n}let n=/\[object ([^\]]+)\]/.exec(toString.call(e)),r;if(n&&n.length>1)r=n[1];else return toString.call(e);if(r==`Object`)try{return`Object(`+JSON.stringify(e)+`)`}catch{return`Object`}return e instanceof Error?`${e.name}: ${e.message}\n${e.stack}`:r}function N(e,t){e>>>=0;let n=I(),r=[];for(let i=e;i<e+4*t;i+=4)r.push(J.__wbindgen_externrefs.get(n.getUint32(i,!0)));return J.__externref_drop_slice(e,t),r}function Be(e,t){return e>>>=0,z().subarray(e/1,e/1+t)}var P=null;function Ve(){return(P===null||P.byteLength===0)&&(P=new BigUint64Array(J.memory.buffer)),P}var F=null;function I(){return(F===null||F.buffer.detached===!0||F.buffer.detached===void 0&&F.buffer!==J.memory.buffer)&&(F=new DataView(J.memory.buffer)),F}function L(e,t){return Ke(e>>>0,t)}var R=null;function z(){return(R===null||R.byteLength===0)&&(R=new Uint8Array(J.memory.buffer)),R}function B(e,t){try{return e.apply(this,t)}catch(e){let t=Re(e);J.__wbindgen_exn_store(t)}}function V(e){return e==null}function He(e,t){let n=t(e.length*8,8)>>>0;return Ve().set(e,n/8),q=e.length,n}function Ue(e,t){let n=t(e.length*1,1)>>>0;return z().set(e,n/1),q=e.length,n}function H(e,t){let n=t(e.length*4,4)>>>0;for(let t=0;t<e.length;t++){let r=Re(e[t]);I().setUint32(n+4*t,r,!0)}return q=e.length,n}function U(e,t,n){if(n===void 0){let n=K.encode(e),r=t(n.length,1)>>>0;return z().subarray(r,r+n.length).set(n),q=n.length,r}let r=e.length,i=t(r,1)>>>0,a=z(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=z().subarray(i+o,i+r),a=K.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return q=o,i}function W(e){let t=J.__wbindgen_externrefs.get(e);return J.__externref_table_dealloc(e),t}var G=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});G.decode();var We=2146435072,Ge=0;function Ke(e,t){return Ge+=t,Ge>=We&&(G=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),G.decode(),Ge=t),G.decode(z().subarray(e,e+t))}var K=new TextEncoder;`encodeInto`in K||(K.encodeInto=function(e,t){let n=K.encode(e);return t.set(n),{read:e.length,written:n.length}});var q=0,J;function qe(e,t){return J=e.exports,P=null,F=null,R=null,J.__wbindgen_start(),J}async function Je(e,t){if(typeof Response==`function`&&e instanceof Response){if(!e.ok)throw Error(`failed to fetch Wasm: ${e.status} ${e.statusText} fetching '${e.url}'`);if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}function Ye(e){if(J!==void 0)return J;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module:e}=e:console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));let t=Me();return e instanceof WebAssembly.Module||(e=new WebAssembly.Module(e)),qe(new WebAssembly.Instance(e,t),e)}async function Xe(e){if(J!==void 0)return J;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`)),e===void 0&&(e=new URL);let t=Me();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:n,module:r}=await Je(await e,t);return qe(n,r)}var Y=class e extends Promise{#e;#t;constructor(e){super(e=>{e()}),this.#e=e}static from(t){return new e(e=>{e(t())})}static resolve(t){return new e(e=>{e(t)})}static reject(t){return new e((e,n)=>{n(t)})}then(e,t){return this.#t??=new Promise(this.#e),this.#t.then(e,t)}catch(e){return this.#t??=new Promise(this.#e),this.#t.catch(e)}finally(e){return this.#t??=new Promise(this.#e),this.#t.finally(e)}},Ze=(e,t,n,r)=>{if(n===`length`||n===`prototype`||n===`arguments`||n===`caller`)return;let i=Object.getOwnPropertyDescriptor(e,n),a=Object.getOwnPropertyDescriptor(t,n);(Qe(i,a)||!r)&&Object.defineProperty(e,n,a)},Qe=function(e,t){return e===void 0||e.configurable||e.writable===t.writable&&e.enumerable===t.enumerable&&e.configurable===t.configurable&&(e.writable||e.value===t.value)},$e=(e,t)=>{let n=Object.getPrototypeOf(t);n!==Object.getPrototypeOf(e)&&Object.setPrototypeOf(e,n)},et=(e,t)=>`/* Wrapped ${e}*/\n${t}`,tt=Object.getOwnPropertyDescriptor(Function.prototype,`toString`),nt=Object.getOwnPropertyDescriptor(Function.prototype.toString,`name`),rt=(e,t,n)=>{let r=n===``?``:`with ${n.trim()}() `,i=et.bind(null,r,t.toString());Object.defineProperty(i,"name",nt),Object.defineProperty(e,"toString",{...tt,value:i})};function it(e,t,{ignoreNonConfigurable:n=!1}={}){let{name:r}=e;for(let r of Reflect.ownKeys(t))Ze(e,t,r,n);return $e(e,t),rt(e,t,r),e}var at=/* @__PURE__ */ new WeakMap;function ot(e,{cacheKey:t=([e])=>e,cache:n=/* @__PURE__ */ new Map}={}){let r=/* @__PURE__ */ new Map,i=function(...i){let a=t(i);if(r.has(a))return r.get(a);let o=(async()=>{try{if(n&&await n.has(a))return await n.get(a);let t=await e.apply(this,i);try{return t}finally{n&&await n.set(a,t)}}finally{r.delete(a)}})();return r.set(a,o),o};return it(i,e,{ignoreNonConfigurable:!0}),at.set(i,n),i}function st(e){return e.includes(`harper_wasm_slim`)?`slim`:`full`}function ct(e){return e===`slim`?n:we}function lt(e,t){return t===`slim`?e:e.includes(`harper_wasm_bg.wasm`)?e.replace(`harper_wasm_bg.wasm`,`harper_wasm_slim_bg.wasm`):null}function ut(e){return typeof process<`u`&&e.startsWith(`file://`)?import(
/* webpackIgnore: true */
/* @vite-ignore */
`fs`).then(t=>new Promise((n,r)=>{t.readFile(new URL(e).pathname,(e,t)=>{e&&r(e),n(t)})})):e}async function dt(e,t){let n=ct(t),r=lt(e,t);if(r!=null)try{await Ce({module_or_path:ut(r)})}catch(e){if(t===`slim`)throw e}return await n.default({module_or_path:ut(e)}),n}var ft={full:ot(e=>dt(e,`full`)),slim:ot(e=>dt(e,`slim`))};function pt(e,t){return ft[t](e)}var mt=class{url=``;glueFlavor=`full`;inner=null;static create(e,t){let n=new ht;return n.url=e,n.glueFlavor=t??st(typeof e==`string`?e:e.href),n.inner=Y.from(()=>pt(typeof n.url==`string`?n.url:n.url.href,n.glueFlavor)),n}async getDefaultLintConfigAsJSON(){return(await this.inner).get_default_lint_config_as_json()}async getDefaultLintConfig(){return(await this.inner).get_default_lint_config()}async toTitleCase(e){return(await this.inner).to_title_case(e)}async setup(){(await this.inner).setup()}},ht=class extends mt{async createLinter(e){return(await this.getBinaryModule()).Linter.new(e??r.American)}async getBinaryModule(){return await Y.from(()=>pt(typeof this.url==`string`?this.url:this.url.href,this.glueFlavor))}};function gt(e){switch(e){case`plaintext`:return i.Plain;case`typst`:return i.Typst;case`markdown`:case void 0:return i.Markdown;default:return console.warn(`Unknown Harper language '${String(e)}'; using markdown.`),i.Markdown}}function _t(e,t){return[e,gt(t?.language),t?.forceAllHeadings??!1,t?.regex_mask,t?.dedup??!0,t?.isolateEnglish??!1]}var vt=class{binary;inner;disposed=!1;constructor(e){this.binary=e.binary,this.binary.setup(),this.inner=this.createInner(e.dialect)}createInner(e){return Y.from(async()=>(await this.binary.setup(),this.binary.createLinter(e)))}async setup(){await this.lint(``,{language:`plaintext`});let e=await this.exportIgnoredLints();await this.importIgnoredLints(e)}async lint(e,t){return(await this.inner).lint(..._t(e,t))}async organizedLints(e,t){let n=(await this.inner).organized_lints(..._t(e,t)),r={};for(let e of n)r[e.group]=e.lints,e.free();return r}async applySuggestion(e,t,n){return(await this.inner).apply_suggestion(e,t,n)}async isLikelyEnglish(e){return(await this.inner).is_likely_english(e)}async isolateEnglish(e){return(await this.inner).isolate_english(e)}async getLintConfig(){return(await this.inner).get_lint_config_as_object()}async getDefaultLintConfigAsJSON(){return await this.binary.getDefaultLintConfigAsJSON()}async getDefaultLintConfig(){return await this.binary.getDefaultLintConfig()}async getStructuredLintConfig(){return(await this.inner).get_structured_lint_config_as_object()}async getStructuredLintConfigJSON(){return(await this.inner).get_structured_lint_config_as_json()}async setLintConfig(e){(await this.inner).set_lint_config_from_object(e)}async getLintConfigAsJSON(){return(await this.inner).get_lint_config_as_json()}async setLintConfigWithJSON(e){(await this.inner).set_lint_config_from_json(e)}async toTitleCase(e){return await this.binary.toTitleCase(e)}async getLintDescriptions(){return(await this.inner).get_lint_descriptions_as_object()}async getLintDescriptionsAsJSON(){return(await this.inner).get_lint_descriptions_as_json()}async getLintDescriptionsHTML(){return(await this.inner).get_lint_descriptions_html_as_object()}async getLintDescriptionsHTMLAsJSON(){return(await this.inner).get_lint_descriptions_html_as_json()}async ignoreLint(e,t){return await this.ignoreLints(e,[t])}async ignoreLints(e,t){(await this.inner).ignore_lints(e,t)}async ignoreLintHash(e){(await this.inner).ignore_hashes(new BigUint64Array([e]))}async exportIgnoredLints(){return(await this.inner).export_ignored_lints()}async importIgnoredLints(e){(await this.inner).import_ignored_lints(e)}async contextHash(e,t){return(await this.inner).context_hash(e,t)}async clearIgnoredLints(){(await this.inner).clear_ignored_lints()}async clearWords(){return(await this.inner).clear_words()}async importWords(e){return(await this.inner).import_words(e)}async exportWords(){return(await this.inner).export_words()}async getDialect(){return(await this.inner).get_dialect()}async setDialect(e){let t=await this.inner;return t.get_dialect()!==e&&(t.free(),this.inner=this.createInner(e)),Promise.resolve()}async summarizeStats(e,t){return(await this.inner).summarize_stats(e,t)}async generateStatsFile(){return(await this.inner).generate_stats_file()}async importStatsFile(e){return(await this.inner).import_stats_file(e)}async loadWeirpackFromBlob(e){let t=new Uint8Array(await e.arrayBuffer());return this.loadWeirpackFromBytes(t)}async loadWeirpackFromBytes(e){let t=await this.inner,n=e instanceof Uint8Array?e:Uint8Array.from(e);return t.import_weirpack(n)}async dispose(){this.disposed||(this.disposed=!0,(await this.inner).free())}};typeof self<`u`&&self.Blob&&new Blob([`URL.revokeObjectURL(import.meta.url);`,`// \\0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
// ../../harper-wasm/pkg/harper_wasm_slim.js
var harper_wasm_slim_exports = /* @__PURE__ */ __exportAll({
	Dialect: () => Dialect$1,
	Language: () => Language$1,
	Lint: () => Lint$1,
	Linter: () => Linter$1,
	OrganizedGroup: () => OrganizedGroup$1,
	Span: () => Span$1,
	Suggestion: () => Suggestion$1,
	SuggestionKind: () => SuggestionKind$1,
	default: () => __wbg_init$1,
	get_default_lint_config: () => get_default_lint_config$1,
	get_default_lint_config_as_json: () => get_default_lint_config_as_json$1,
	initSync: () => initSync$1,
	setup: () => setup$1,
	to_title_case: () => to_title_case$1
});
/**
* Specifies an English Dialect, often used for linting.
* @enum {0 | 1 | 2 | 3 | 4}
*/
const Dialect$1 = Object.freeze({
	American: 0,
	"0": "American",
	British: 1,
	"1": "British",
	Australian: 2,
	"2": "Australian",
	Canadian: 3,
	"3": "Canadian",
	Indian: 4,
	"4": "Indian"
});
/**
* @enum {0 | 1 | 2}
*/
const Language$1 = Object.freeze({
	Plain: 0,
	"0": "Plain",
	Markdown: 1,
	"1": "Markdown",
	Typst: 2,
	"2": "Typst"
});
/**
* An error found in provided text.
*
* May include zero or more suggestions that may fix the problematic text.
*/
var Lint$1 = class Lint$1 {
	static __wrap(ptr) {
		const obj = Object.create(Lint$1.prototype);
		obj.__wbg_ptr = ptr;
		LintFinalization$1.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	static __unwrap(jsValue) {
		if (!(jsValue instanceof Lint$1)) return 0;
		return jsValue.__destroy_into_raw();
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		LintFinalization$1.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm$1.__wbg_lint_free(ptr, 0);
	}
	/**
	* @param {string} json
	* @returns {Lint}
	*/
	static from_json(json) {
		const ptr0 = passStringToWasm0$1(json, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.lint_from_json(ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0$1(ret[1]);
		return Lint$1.__wrap(ret[0]);
	}
	/**
	* Get the content of the source material pointed to by [\`Self::span\`]
	* @returns {string}
	*/
	get_problem_text() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.lint_get_problem_text(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a string representing the general category of the lint.
	* @returns {string}
	*/
	lint_kind() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.lint_lint_kind(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a string representing the general category of the lint.
	* @returns {string}
	*/
	lint_kind_pretty() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.lint_lint_kind_pretty(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a description of the error.
	* @returns {string}
	*/
	message() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.lint_message(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a description of the error as HTML.
	* @returns {string}
	*/
	message_html() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.lint_message_html(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get the location of the problematic text.
	* @returns {Span}
	*/
	span() {
		const ret = wasm$1.lint_span(this.__wbg_ptr);
		return Span$1.__wrap(ret);
	}
	/**
	* Equivalent to calling \`.length\` on the result of \`suggestions()\`.
	* @returns {number}
	*/
	suggestion_count() {
		return wasm$1.lint_suggestion_count(this.__wbg_ptr) >>> 0;
	}
	/**
	* Get an array of any suggestions that may resolve the issue.
	* @returns {Suggestion[]}
	*/
	suggestions() {
		const ret = wasm$1.lint_suggestions(this.__wbg_ptr);
		var v1 = getArrayJsValueFromWasm0$1(ret[0], ret[1]);
		wasm$1.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v1;
	}
	/**
	* @returns {string}
	*/
	to_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.lint_to_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
};
if (Symbol.dispose) Lint$1.prototype[Symbol.dispose] = Lint$1.prototype.free;
var Linter$1 = class Linter$1 {
	static __wrap(ptr) {
		const obj = Object.create(Linter$1.prototype);
		obj.__wbg_ptr = ptr;
		LinterFinalization$1.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		LinterFinalization$1.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm$1.__wbg_linter_free(ptr, 0);
	}
	/**
	* Apply a suggestion from a given lint.
	* This action will be logged to the Linter's statistics.
	* @param {string} source_text
	* @param {Lint} lint
	* @param {Suggestion} suggestion
	* @returns {string}
	*/
	apply_suggestion(source_text, lint, suggestion) {
		let deferred3_0;
		let deferred3_1;
		try {
			const ptr0 = passStringToWasm0$1(source_text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
			const len0 = WASM_VECTOR_LEN$1;
			_assertClass$1(lint, Lint$1);
			_assertClass$1(suggestion, Suggestion$1);
			const ret = wasm$1.linter_apply_suggestion(this.__wbg_ptr, ptr0, len0, lint.__wbg_ptr, suggestion.__wbg_ptr);
			var ptr2 = ret[0];
			var len2 = ret[1];
			if (ret[3]) {
				ptr2 = 0;
				len2 = 0;
				throw takeFromExternrefTable0$1(ret[2]);
			}
			deferred3_0 = ptr2;
			deferred3_1 = len2;
			return getStringFromWasm0$1(ptr2, len2);
		} finally {
			wasm$1.__wbindgen_free(deferred3_0, deferred3_1, 1);
		}
	}
	clear_ignored_lints() {
		wasm$1.linter_clear_ignored_lints(this.__wbg_ptr);
	}
	/**
	* Clear the user dictionary.
	*/
	clear_words() {
		wasm$1.linter_clear_words(this.__wbg_ptr);
	}
	/**
	* Compute the context hash of a given lint.
	* @param {string} source_text
	* @param {Lint} lint
	* @returns {bigint}
	*/
	context_hash(source_text, lint) {
		const ptr0 = passStringToWasm0$1(source_text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		_assertClass$1(lint, Lint$1);
		const ret = wasm$1.linter_context_hash(this.__wbg_ptr, ptr0, len0, lint.__wbg_ptr);
		return BigInt.asUintN(64, ret);
	}
	/**
	* Export the linter's ignored lints as a privacy-respecting JSON list of hashes.
	* @returns {string}
	*/
	export_ignored_lints() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.linter_export_ignored_lints(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Export words from the dictionary.
	* Note: this will only return words previously added by [\`Self::import_words\`].
	* @returns {string[]}
	*/
	export_words() {
		const ret = wasm$1.linter_export_words(this.__wbg_ptr);
		var v1 = getArrayJsValueFromWasm0$1(ret[0], ret[1]);
		wasm$1.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v1;
	}
	/**
	* @returns {string}
	*/
	generate_stats_file() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.linter_generate_stats_file(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get the dialect this struct was constructed for.
	* @returns {Dialect}
	*/
	get_dialect() {
		return wasm$1.linter_get_dialect(this.__wbg_ptr);
	}
	/**
	* @returns {string}
	*/
	get_lint_config_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.linter_get_lint_config_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {any}
	*/
	get_lint_config_as_object() {
		return wasm$1.linter_get_lint_config_as_object(this.__wbg_ptr);
	}
	/**
	* Get a JSON map containing the descriptions of all the linting rules, formatted as Markdown.
	* @returns {string}
	*/
	get_lint_descriptions_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.linter_get_lint_descriptions_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a Record containing the descriptions of all the linting rules, formatted as Markdown.
	* @returns {any}
	*/
	get_lint_descriptions_as_object() {
		return wasm$1.linter_get_lint_descriptions_as_object(this.__wbg_ptr);
	}
	/**
	* Get a JSON map containing the descriptions of all the linting rules, formatted as HTML.
	* @returns {string}
	*/
	get_lint_descriptions_html_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.linter_get_lint_descriptions_html_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a Record containing the descriptions of all the linting rules, formatted as HTML.
	* @returns {any}
	*/
	get_lint_descriptions_html_as_object() {
		return wasm$1.linter_get_lint_descriptions_html_as_object(this.__wbg_ptr);
	}
	/**
	* @returns {string}
	*/
	get_structured_lint_config_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.linter_get_structured_lint_config_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {any}
	*/
	get_structured_lint_config_as_object() {
		return wasm$1.linter_get_structured_lint_config_as_object(this.__wbg_ptr);
	}
	/**
	* Add a specific context hash to the ignored lints list.
	* @param {BigUint64Array} hashes
	*/
	ignore_hashes(hashes) {
		const ptr0 = passArray64ToWasm0$1(hashes, wasm$1.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN$1;
		wasm$1.linter_ignore_hashes(this.__wbg_ptr, ptr0, len0);
	}
	/**
	* @param {string} source_text
	* @param {Lint[]} lints
	*/
	ignore_lints(source_text, lints) {
		const ptr0 = passStringToWasm0$1(source_text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ptr1 = passArrayJsValueToWasm0$1(lints, wasm$1.__wbindgen_malloc);
		const len1 = WASM_VECTOR_LEN$1;
		wasm$1.linter_ignore_lints(this.__wbg_ptr, ptr0, len0, ptr1, len1);
	}
	/**
	* Import into the linter's ignored lints from a privacy-respecting JSON list of hashes.
	* @param {string} json
	*/
	import_ignored_lints(json) {
		const ptr0 = passStringToWasm0$1(json, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.linter_import_ignored_lints(this.__wbg_ptr, ptr0, len0);
		if (ret[1]) throw takeFromExternrefTable0$1(ret[0]);
	}
	/**
	* @param {string} file
	*/
	import_stats_file(file) {
		const ptr0 = passStringToWasm0$1(file, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.linter_import_stats_file(this.__wbg_ptr, ptr0, len0);
		if (ret[1]) throw takeFromExternrefTable0$1(ret[0]);
	}
	/**
	* Load a Weirpack from raw bytes, merging its rules into the current linter.
	* Returns test failures if any are found, and does not import in that case.
	* @param {Uint8Array} bytes
	* @returns {any}
	*/
	import_weirpack(bytes) {
		const ptr0 = passArray8ToWasm0$1(bytes, wasm$1.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.linter_import_weirpack(this.__wbg_ptr, ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0$1(ret[1]);
		return takeFromExternrefTable0$1(ret[0]);
	}
	/**
	* Import words into the dictionary.
	* @param {string[]} additional_words
	*/
	import_words(additional_words) {
		const ptr0 = passArrayJsValueToWasm0$1(additional_words, wasm$1.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN$1;
		wasm$1.linter_import_words(this.__wbg_ptr, ptr0, len0);
	}
	/**
	* Helper method to quickly check if a plain string is likely intended to be English
	* @param {string} text
	* @returns {boolean}
	*/
	is_likely_english(text) {
		const ptr0 = passStringToWasm0$1(text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		return wasm$1.linter_is_likely_english(this.__wbg_ptr, ptr0, len0) !== 0;
	}
	/**
	* Helper method to remove non-English text from a plain English document.
	* @param {string} text
	* @returns {string}
	*/
	isolate_english(text) {
		let deferred2_0;
		let deferred2_1;
		try {
			const ptr0 = passStringToWasm0$1(text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
			const len0 = WASM_VECTOR_LEN$1;
			const ret = wasm$1.linter_isolate_english(this.__wbg_ptr, ptr0, len0);
			deferred2_0 = ret[0];
			deferred2_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred2_0, deferred2_1, 1);
		}
	}
	/**
	* Perform the configured linting on the provided text.
	*
	* If the provided regex mask cannot be parsed, this method will return an empty array.
	* @param {string} text
	* @param {Language} language
	* @param {boolean} all_headings
	* @param {string | null | undefined} regex_mask
	* @param {boolean} dedup
	* @param {boolean} isolate_english
	* @returns {Lint[]}
	*/
	lint(text, language, all_headings, regex_mask, dedup, isolate_english) {
		const ptr0 = passStringToWasm0$1(text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		var ptr1 = isLikeNone$1(regex_mask) ? 0 : passStringToWasm0$1(regex_mask, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		var len1 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.linter_lint(this.__wbg_ptr, ptr0, len0, language, all_headings, ptr1, len1, dedup, isolate_english);
		var v3 = getArrayJsValueFromWasm0$1(ret[0], ret[1]);
		wasm$1.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v3;
	}
	/**
	* Construct a new \`Linter\`.
	* Note that this can mean constructing the curated dictionary, which is the most expensive operation
	* in Harper.
	* @param {Dialect} dialect
	* @returns {Linter}
	*/
	static new(dialect) {
		const ret = wasm$1.linter_new(dialect);
		return Linter$1.__wrap(ret);
	}
	/**
	* @param {string} text
	* @param {Language} language
	* @param {boolean} all_headings
	* @param {string | null | undefined} regex_mask
	* @param {boolean} dedup
	* @param {boolean} isolate_english
	* @returns {OrganizedGroup[]}
	*/
	organized_lints(text, language, all_headings, regex_mask, dedup, isolate_english) {
		const ptr0 = passStringToWasm0$1(text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		var ptr1 = isLikeNone$1(regex_mask) ? 0 : passStringToWasm0$1(regex_mask, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		var len1 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.linter_organized_lints(this.__wbg_ptr, ptr0, len0, language, all_headings, ptr1, len1, dedup, isolate_english);
		var v3 = getArrayJsValueFromWasm0$1(ret[0], ret[1]);
		wasm$1.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v3;
	}
	/**
	* @param {string} json
	*/
	set_lint_config_from_json(json) {
		const ptr0 = passStringToWasm0$1(json, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.linter_set_lint_config_from_json(this.__wbg_ptr, ptr0, len0);
		if (ret[1]) throw takeFromExternrefTable0$1(ret[0]);
	}
	/**
	* @param {any} object
	*/
	set_lint_config_from_object(object) {
		const ret = wasm$1.linter_set_lint_config_from_object(this.__wbg_ptr, object);
		if (ret[1]) throw takeFromExternrefTable0$1(ret[0]);
	}
	/**
	* @param {bigint | null} [start_time]
	* @param {bigint | null} [end_time]
	* @returns {any}
	*/
	summarize_stats(start_time, end_time) {
		return wasm$1.linter_summarize_stats(this.__wbg_ptr, !isLikeNone$1(start_time), isLikeNone$1(start_time) ? BigInt(0) : start_time, !isLikeNone$1(end_time), isLikeNone$1(end_time) ? BigInt(0) : end_time);
	}
};
if (Symbol.dispose) Linter$1.prototype[Symbol.dispose] = Linter$1.prototype.free;
/**
* Used exclusively for [\`Linter::organized_lints\`]
*/
var OrganizedGroup$1 = class OrganizedGroup$1 {
	static __wrap(ptr) {
		const obj = Object.create(OrganizedGroup$1.prototype);
		obj.__wbg_ptr = ptr;
		OrganizedGroupFinalization$1.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		OrganizedGroupFinalization$1.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm$1.__wbg_organizedgroup_free(ptr, 0);
	}
	/**
	* @returns {string}
	*/
	get group() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.__wbg_get_organizedgroup_group(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {Lint[]}
	*/
	get lints() {
		const ret = wasm$1.__wbg_get_organizedgroup_lints(this.__wbg_ptr);
		var v1 = getArrayJsValueFromWasm0$1(ret[0], ret[1]);
		wasm$1.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v1;
	}
	/**
	* @param {string} arg0
	*/
	set group(arg0) {
		const ptr0 = passStringToWasm0$1(arg0, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		wasm$1.__wbg_set_organizedgroup_group(this.__wbg_ptr, ptr0, len0);
	}
	/**
	* @param {Lint[]} arg0
	*/
	set lints(arg0) {
		const ptr0 = passArrayJsValueToWasm0$1(arg0, wasm$1.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN$1;
		wasm$1.__wbg_set_organizedgroup_lints(this.__wbg_ptr, ptr0, len0);
	}
};
if (Symbol.dispose) OrganizedGroup$1.prototype[Symbol.dispose] = OrganizedGroup$1.prototype.free;
/**
* A struct that represents two character indices in a string: a start and an end.
*/
var Span$1 = class Span$1 {
	static __wrap(ptr) {
		const obj = Object.create(Span$1.prototype);
		obj.__wbg_ptr = ptr;
		SpanFinalization$1.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		SpanFinalization$1.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm$1.__wbg_span_free(ptr, 0);
	}
	/**
	* @returns {number}
	*/
	get end() {
		return wasm$1.__wbg_get_span_end(this.__wbg_ptr) >>> 0;
	}
	/**
	* @returns {number}
	*/
	get start() {
		return wasm$1.__wbg_get_span_start(this.__wbg_ptr) >>> 0;
	}
	/**
	* @param {number} arg0
	*/
	set end(arg0) {
		wasm$1.__wbg_set_span_end(this.__wbg_ptr, arg0);
	}
	/**
	* @param {number} arg0
	*/
	set start(arg0) {
		wasm$1.__wbg_set_span_start(this.__wbg_ptr, arg0);
	}
	/**
	* @param {string} json
	* @returns {Span}
	*/
	static from_json(json) {
		const ptr0 = passStringToWasm0$1(json, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.span_from_json(ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0$1(ret[1]);
		return Span$1.__wrap(ret[0]);
	}
	/**
	* @returns {boolean}
	*/
	is_empty() {
		return wasm$1.span_is_empty(this.__wbg_ptr) !== 0;
	}
	/**
	* @returns {number}
	*/
	len() {
		return wasm$1.span_len(this.__wbg_ptr) >>> 0;
	}
	/**
	* @param {number} start
	* @param {number} end
	* @returns {Span}
	*/
	static new(start, end) {
		const ret = wasm$1.span_new(start, end);
		return Span$1.__wrap(ret);
	}
	/**
	* @returns {string}
	*/
	to_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.span_to_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
};
if (Symbol.dispose) Span$1.prototype[Symbol.dispose] = Span$1.prototype.free;
/**
* A suggestion to fix a Lint.
*/
var Suggestion$1 = class Suggestion$1 {
	static __wrap(ptr) {
		const obj = Object.create(Suggestion$1.prototype);
		obj.__wbg_ptr = ptr;
		SuggestionFinalization$1.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		SuggestionFinalization$1.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm$1.__wbg_suggestion_free(ptr, 0);
	}
	/**
	* @param {string} json
	* @returns {Suggestion}
	*/
	static from_json(json) {
		const ptr0 = passStringToWasm0$1(json, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.suggestion_from_json(ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0$1(ret[1]);
		return Suggestion$1.__wrap(ret[0]);
	}
	/**
	* Get the text that is going to replace the problematic section.
	* If [\`Self::kind\`] is \`SuggestionKind::Remove\`, this will return an empty
	* string.
	* @returns {string}
	*/
	get_replacement_text() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.suggestion_get_replacement_text(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {SuggestionKind}
	*/
	kind() {
		return wasm$1.suggestion_kind(this.__wbg_ptr);
	}
	/**
	* @returns {string}
	*/
	to_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm$1.suggestion_to_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0$1(ret[0], ret[1]);
		} finally {
			wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
};
if (Symbol.dispose) Suggestion$1.prototype[Symbol.dispose] = Suggestion$1.prototype.free;
/**
* Tags the variant of suggestion.
* @enum {0 | 1 | 2}
*/
const SuggestionKind$1 = Object.freeze({
	/**
	* Replace the problematic text.
	*/
	Replace: 0,
	"0": "Replace",
	/**
	* Remove the problematic text.
	*/
	Remove: 1,
	"1": "Remove",
	/**
	* Insert additional text after the error.
	*/
	InsertAfter: 2,
	"2": "InsertAfter"
});
/**
* @returns {any}
*/
function get_default_lint_config$1() {
	return wasm$1.get_default_lint_config();
}
/**
* @returns {string}
*/
function get_default_lint_config_as_json$1() {
	let deferred1_0;
	let deferred1_1;
	try {
		const ret = wasm$1.get_default_lint_config_as_json();
		deferred1_0 = ret[0];
		deferred1_1 = ret[1];
		return getStringFromWasm0$1(ret[0], ret[1]);
	} finally {
		wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
	}
}
/**
* Set up the WebAssembly module's logging.
*/
function setup$1() {
	wasm$1.setup();
}
/**
* @param {string} text
* @returns {string}
*/
function to_title_case$1(text) {
	let deferred2_0;
	let deferred2_1;
	try {
		const ptr0 = passStringToWasm0$1(text, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN$1;
		const ret = wasm$1.to_title_case(ptr0, len0);
		deferred2_0 = ret[0];
		deferred2_1 = ret[1];
		return getStringFromWasm0$1(ret[0], ret[1]);
	} finally {
		wasm$1.__wbindgen_free(deferred2_0, deferred2_1, 1);
	}
}
function __wbg_get_imports$1() {
	return {
		__proto__: null,
		"./harper_wasm_slim_bg.js": {
			__proto__: null,
			__wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
				return Error(getStringFromWasm0$1(arg0, arg1));
			},
			__wbg_String_8564e559799eccda: function(arg0, arg1) {
				const ptr1 = passStringToWasm0$1(String(arg1), wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
				const len1 = WASM_VECTOR_LEN$1;
				getDataViewMemory0$1().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0$1().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
				const v = arg0;
				const ret = typeof v === "boolean" ? v : void 0;
				return isLikeNone$1(ret) ? 16777215 : ret ? 1 : 0;
			},
			__wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
				const ptr1 = passStringToWasm0$1(debugString$1(arg1), wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
				const len1 = WASM_VECTOR_LEN$1;
				getDataViewMemory0$1().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0$1().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
				return typeof arg0 === "function";
			},
			__wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
				const val = arg0;
				return typeof val === "object" && val !== null;
			},
			__wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
				return typeof arg0 === "string";
			},
			__wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
				return arg0 == arg1;
			},
			__wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
				const obj = arg1;
				const ret = typeof obj === "number" ? obj : void 0;
				getDataViewMemory0$1().setFloat64(arg0 + 8, isLikeNone$1(ret) ? 0 : ret, true);
				getDataViewMemory0$1().setInt32(arg0 + 0, !isLikeNone$1(ret), true);
			},
			__wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
				const obj = arg1;
				const ret = typeof obj === "string" ? obj : void 0;
				var ptr1 = isLikeNone$1(ret) ? 0 : passStringToWasm0$1(ret, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
				var len1 = WASM_VECTOR_LEN$1;
				getDataViewMemory0$1().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0$1().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
				throw new Error(getStringFromWasm0$1(arg0, arg1));
			},
			__wbg_call_6137034ef55c9d0f: function() {
				return handleError$1(function(arg0, arg1) {
					return arg0.call(arg1);
				}, arguments);
			},
			__wbg_done_b41a1d26cdb37fb6: function(arg0) {
				return arg0.done;
			},
			__wbg_entries_fb6397112b1de25f: function(arg0) {
				return Object.entries(arg0);
			},
			__wbg_error_757e9472f8410341: function(arg0, arg1) {
				let deferred0_0;
				let deferred0_1;
				try {
					deferred0_0 = arg0;
					deferred0_1 = arg1;
					console.error(getStringFromWasm0$1(arg0, arg1));
				} finally {
					wasm$1.__wbindgen_free(deferred0_0, deferred0_1, 1);
				}
			},
			__wbg_getRandomValues_973dabfb0ad1769f: function() {
				return handleError$1(function(arg0, arg1) {
					globalThis.crypto.getRandomValues(getArrayU8FromWasm0$1(arg0, arg1));
				}, arguments);
			},
			__wbg_getRandomValues_a608c4436c19407a: function() {
				return handleError$1(function(arg0, arg1) {
					globalThis.crypto.getRandomValues(getArrayU8FromWasm0$1(arg0, arg1));
				}, arguments);
			},
			__wbg_getTime_f5a55efff2585d5d: function(arg0) {
				return arg0.getTime();
			},
			__wbg_get_658f6698067d9515: function() {
				return handleError$1(function(arg0, arg1) {
					return Reflect.get(arg0, arg1);
				}, arguments);
			},
			__wbg_get_6c896e0571ddae51: function(arg0, arg1) {
				return arg0[arg1 >>> 0];
			},
			__wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
				return arg0[arg1 >>> 0];
			},
			__wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
				let result;
				try {
					result = arg0 instanceof ArrayBuffer;
				} catch (_) {
					result = false;
				}
				return result;
			},
			__wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
				let result;
				try {
					result = arg0 instanceof Uint8Array;
				} catch (_) {
					result = false;
				}
				return result;
			},
			__wbg_iterator_e3c31c892080e444: function() {
				return Symbol.iterator;
			},
			__wbg_length_7f3c00c40364105e: function(arg0) {
				return arg0.length;
			},
			__wbg_length_d4bdea10311bd9cf: function(arg0) {
				return arg0.length;
			},
			__wbg_lint_new: function(arg0) {
				return Lint$1.__wrap(arg0);
			},
			__wbg_lint_unwrap: function(arg0) {
				return Lint$1.__unwrap(arg0);
			},
			__wbg_log_1f8cbb01c83d06c2: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
				let deferred0_0;
				let deferred0_1;
				try {
					deferred0_0 = arg0;
					deferred0_1 = arg1;
					console.log(getStringFromWasm0$1(arg0, arg1), getStringFromWasm0$1(arg2, arg3), getStringFromWasm0$1(arg4, arg5), getStringFromWasm0$1(arg6, arg7));
				} finally {
					wasm$1.__wbindgen_free(deferred0_0, deferred0_1, 1);
				}
			},
			__wbg_log_a54ca6b45e09078a: function(arg0, arg1) {
				let deferred0_0;
				let deferred0_1;
				try {
					deferred0_0 = arg0;
					deferred0_1 = arg1;
					console.log(getStringFromWasm0$1(arg0, arg1));
				} finally {
					wasm$1.__wbindgen_free(deferred0_0, deferred0_1, 1);
				}
			},
			__wbg_mark_6b7f03786f5e4d61: function(arg0, arg1) {
				performance.mark(getStringFromWasm0$1(arg0, arg1));
			},
			__wbg_measure_0e21b33a1c6e3a29: function() {
				return handleError$1(function(arg0, arg1, arg2, arg3) {
					let deferred0_0;
					let deferred0_1;
					let deferred1_0;
					let deferred1_1;
					try {
						deferred0_0 = arg0;
						deferred0_1 = arg1;
						deferred1_0 = arg2;
						deferred1_1 = arg3;
						performance.measure(getStringFromWasm0$1(arg0, arg1), getStringFromWasm0$1(arg2, arg3));
					} finally {
						wasm$1.__wbindgen_free(deferred0_0, deferred0_1, 1);
						wasm$1.__wbindgen_free(deferred1_0, deferred1_1, 1);
					}
				}, arguments);
			},
			__wbg_new_0_72d020f0c63443d4: function() {
				return /* @__PURE__ */ new Date();
			},
			__wbg_new_1dbf7428bba60a42: function(arg0) {
				return new Uint8Array(arg0);
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ new Error();
			},
			__wbg_new_28744009d011f847: function() {
				return /* @__PURE__ */ new Map();
			},
			__wbg_new_617a8cdb8bb1130e: function() {
				return /* @__PURE__ */ new Object();
			},
			__wbg_new_ee2291f50781bf1d: function() {
				return new Array();
			},
			__wbg_next_33784799010f1bbe: function(arg0) {
				return arg0.next;
			},
			__wbg_next_f4aac29c42af995c: function() {
				return handleError$1(function(arg0) {
					return arg0.next();
				}, arguments);
			},
			__wbg_organizedgroup_new: function(arg0) {
				return OrganizedGroup$1.__wrap(arg0);
			},
			__wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
				Uint8Array.prototype.set.call(getArrayU8FromWasm0$1(arg0, arg1), arg2);
			},
			__wbg_set_6ae97e73113c4f0b: function(arg0, arg1, arg2) {
				return arg0.set(arg1, arg2);
			},
			__wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
				arg0[arg1] = arg2;
			},
			__wbg_set_bea140a88be9b277: function(arg0, arg1, arg2) {
				arg0[arg1 >>> 0] = arg2;
			},
			__wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
				const ret = arg1.stack;
				const ptr1 = passStringToWasm0$1(ret, wasm$1.__wbindgen_malloc, wasm$1.__wbindgen_realloc);
				const len1 = WASM_VECTOR_LEN$1;
				getDataViewMemory0$1().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0$1().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg_suggestion_new: function(arg0) {
				return Suggestion$1.__wrap(arg0);
			},
			__wbg_value_f3c585ee8f5ba40c: function(arg0) {
				return arg0.value;
			},
			__wbindgen_generic_0000000000000001: function(arg0) {
				return arg0;
			},
			__wbindgen_generic_0000000000000002: function(arg0, arg1) {
				return getStringFromWasm0$1(arg0, arg1);
			},
			__wbindgen_init_externref_table: function() {
				const table = wasm$1.__wbindgen_externrefs;
				const offset = table.grow(4);
				table.set(0, void 0);
				table.set(offset + 0, void 0);
				table.set(offset + 1, null);
				table.set(offset + 2, true);
				table.set(offset + 3, false);
			}
		}
	};
}
const LintFinalization$1 = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm$1.__wbg_lint_free(ptr, 1));
const LinterFinalization$1 = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm$1.__wbg_linter_free(ptr, 1));
const OrganizedGroupFinalization$1 = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm$1.__wbg_organizedgroup_free(ptr, 1));
const SpanFinalization$1 = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm$1.__wbg_span_free(ptr, 1));
const SuggestionFinalization$1 = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm$1.__wbg_suggestion_free(ptr, 1));
function addToExternrefTable0$1(obj) {
	const idx = wasm$1.__externref_table_alloc();
	wasm$1.__wbindgen_externrefs.set(idx, obj);
	return idx;
}
function _assertClass$1(instance, klass) {
	if (!(instance instanceof klass)) throw new Error(\`expected instance of \${klass.name}\`);
}
function debugString$1(val) {
	const type = typeof val;
	if (type == "number" || type == "boolean" || val == null) return \`\${val}\`;
	if (type == "string") return \`"\${val}"\`;
	if (type == "symbol") {
		const description = val.description;
		if (description == null) return "Symbol";
		else return \`Symbol(\${description})\`;
	}
	if (type == "function") {
		const name = val.name;
		if (typeof name == "string" && name.length > 0) return \`Function(\${name})\`;
		else return "Function";
	}
	if (Array.isArray(val)) {
		const length = val.length;
		let debug = "[";
		if (length > 0) debug += debugString$1(val[0]);
		for (let i = 1; i < length; i++) debug += ", " + debugString$1(val[i]);
		debug += "]";
		return debug;
	}
	const builtInMatches = /\\[object ([^\\]]+)\\]/.exec(toString.call(val));
	let className;
	if (builtInMatches && builtInMatches.length > 1) className = builtInMatches[1];
	else return toString.call(val);
	if (className == "Object") try {
		return "Object(" + JSON.stringify(val) + ")";
	} catch (_) {
		return "Object";
	}
	if (val instanceof Error) return \`\${val.name}: \${val.message}\\n\${val.stack}\`;
	return className;
}
function getArrayJsValueFromWasm0$1(ptr, len) {
	ptr = ptr >>> 0;
	const mem = getDataViewMemory0$1();
	const result = [];
	for (let i = ptr; i < ptr + 4 * len; i += 4) result.push(wasm$1.__wbindgen_externrefs.get(mem.getUint32(i, true)));
	wasm$1.__externref_drop_slice(ptr, len);
	return result;
}
function getArrayU8FromWasm0$1(ptr, len) {
	ptr = ptr >>> 0;
	return getUint8ArrayMemory0$1().subarray(ptr / 1, ptr / 1 + len);
}
let cachedBigUint64ArrayMemory0$1 = null;
function getBigUint64ArrayMemory0$1() {
	if (cachedBigUint64ArrayMemory0$1 === null || cachedBigUint64ArrayMemory0$1.byteLength === 0) cachedBigUint64ArrayMemory0$1 = new BigUint64Array(wasm$1.memory.buffer);
	return cachedBigUint64ArrayMemory0$1;
}
let cachedDataViewMemory0$1 = null;
function getDataViewMemory0$1() {
	if (cachedDataViewMemory0$1 === null || cachedDataViewMemory0$1.buffer.detached === true || cachedDataViewMemory0$1.buffer.detached === void 0 && cachedDataViewMemory0$1.buffer !== wasm$1.memory.buffer) cachedDataViewMemory0$1 = new DataView(wasm$1.memory.buffer);
	return cachedDataViewMemory0$1;
}
function getStringFromWasm0$1(ptr, len) {
	return decodeText$1(ptr >>> 0, len);
}
let cachedUint8ArrayMemory0$1 = null;
function getUint8ArrayMemory0$1() {
	if (cachedUint8ArrayMemory0$1 === null || cachedUint8ArrayMemory0$1.byteLength === 0) cachedUint8ArrayMemory0$1 = new Uint8Array(wasm$1.memory.buffer);
	return cachedUint8ArrayMemory0$1;
}
function handleError$1(f, args) {
	try {
		return f.apply(this, args);
	} catch (e) {
		const idx = addToExternrefTable0$1(e);
		wasm$1.__wbindgen_exn_store(idx);
	}
}
function isLikeNone$1(x) {
	return x === void 0 || x === null;
}
function passArray64ToWasm0$1(arg, malloc) {
	const ptr = malloc(arg.length * 8, 8) >>> 0;
	getBigUint64ArrayMemory0$1().set(arg, ptr / 8);
	WASM_VECTOR_LEN$1 = arg.length;
	return ptr;
}
function passArray8ToWasm0$1(arg, malloc) {
	const ptr = malloc(arg.length * 1, 1) >>> 0;
	getUint8ArrayMemory0$1().set(arg, ptr / 1);
	WASM_VECTOR_LEN$1 = arg.length;
	return ptr;
}
function passArrayJsValueToWasm0$1(array, malloc) {
	const ptr = malloc(array.length * 4, 4) >>> 0;
	for (let i = 0; i < array.length; i++) {
		const add = addToExternrefTable0$1(array[i]);
		getDataViewMemory0$1().setUint32(ptr + 4 * i, add, true);
	}
	WASM_VECTOR_LEN$1 = array.length;
	return ptr;
}
function passStringToWasm0$1(arg, malloc, realloc) {
	if (realloc === void 0) {
		const buf = cachedTextEncoder$1.encode(arg);
		const ptr = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory0$1().subarray(ptr, ptr + buf.length).set(buf);
		WASM_VECTOR_LEN$1 = buf.length;
		return ptr;
	}
	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;
	const mem = getUint8ArrayMemory0$1();
	let offset = 0;
	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 127) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) arg = arg.slice(offset);
		ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
		const view = getUint8ArrayMemory0$1().subarray(ptr + offset, ptr + len);
		const ret = cachedTextEncoder$1.encodeInto(arg, view);
		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}
	WASM_VECTOR_LEN$1 = offset;
	return ptr;
}
function takeFromExternrefTable0$1(idx) {
	const value = wasm$1.__wbindgen_externrefs.get(idx);
	wasm$1.__externref_table_dealloc(idx);
	return value;
}
let cachedTextDecoder$1 = new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true
});
cachedTextDecoder$1.decode();
const MAX_SAFARI_DECODE_BYTES$1 = 2146435072;
let numBytesDecoded$1 = 0;
function decodeText$1(ptr, len) {
	numBytesDecoded$1 += len;
	if (numBytesDecoded$1 >= MAX_SAFARI_DECODE_BYTES$1) {
		cachedTextDecoder$1 = new TextDecoder("utf-8", {
			ignoreBOM: true,
			fatal: true
		});
		cachedTextDecoder$1.decode();
		numBytesDecoded$1 = len;
	}
	return cachedTextDecoder$1.decode(getUint8ArrayMemory0$1().subarray(ptr, ptr + len));
}
const cachedTextEncoder$1 = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder$1)) cachedTextEncoder$1.encodeInto = function(arg, view) {
	const buf = cachedTextEncoder$1.encode(arg);
	view.set(buf);
	return {
		read: arg.length,
		written: buf.length
	};
};
let WASM_VECTOR_LEN$1 = 0;
let wasm$1;
function __wbg_finalize_init$1(instance, module) {
	wasm$1 = instance.exports;
	cachedBigUint64ArrayMemory0$1 = null;
	cachedDataViewMemory0$1 = null;
	cachedUint8ArrayMemory0$1 = null;
	wasm$1.__wbindgen_start();
	return wasm$1;
}
async function __wbg_load$1(module, imports) {
	if (typeof Response === "function" && module instanceof Response) {
		if (!module.ok) throw new Error(\`failed to fetch Wasm: \${module.status} \${module.statusText} fetching '\${module.url}'\`);
		if (typeof WebAssembly.instantiateStreaming === "function") try {
			return await WebAssembly.instantiateStreaming(module, imports);
		} catch (e) {
			if (expectedResponseType(module.type) && module.headers.get("Content-Type") !== "application/wasm") console.warn("\`WebAssembly.instantiateStreaming\` failed because your server does not serve Wasm with \`application/wasm\` MIME type. Falling back to \`WebAssembly.instantiate\` which is slower. Original error:\\n", e);
			else throw e;
		}
		const bytes = await module.arrayBuffer();
		return await WebAssembly.instantiate(bytes, imports);
	} else {
		const instance = await WebAssembly.instantiate(module, imports);
		if (instance instanceof WebAssembly.Instance) return {
			instance,
			module
		};
		else return instance;
	}
	function expectedResponseType(type) {
		switch (type) {
			case "basic":
			case "cors":
			case "default": return true;
		}
		return false;
	}
}
function initSync$1(module) {
	if (wasm$1 !== void 0) return wasm$1;
	if (module !== void 0) {
		if (Object.getPrototypeOf(module) === Object.prototype) ({module} = module);
		else console.warn("using deprecated parameters for \`initSync()\`; pass a single object instead");
	}
	const imports = __wbg_get_imports$1();
	if (!(module instanceof WebAssembly.Module)) module = new WebAssembly.Module(module);
	return __wbg_finalize_init$1(new WebAssembly.Instance(module, imports), module);
}
async function __wbg_init$1(module_or_path) {
	if (wasm$1 !== void 0) return wasm$1;
	if (module_or_path !== void 0) {
		if (Object.getPrototypeOf(module_or_path) === Object.prototype) ({module_or_path} = module_or_path);
		else console.warn("using deprecated parameters for the initialization function; pass a single object instead");
	}
	if (module_or_path === void 0) module_or_path = new URL();
	const imports = __wbg_get_imports$1();
	if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) module_or_path = fetch(module_or_path);
	const { instance, module } = await __wbg_load$1(await module_or_path, imports);
	return __wbg_finalize_init$1(instance, module);
}
// ../../harper-wasm/pkg/harper_wasm.js
var harper_wasm_exports = /* @__PURE__ */ __exportAll({
	Dialect: () => Dialect,
	Language: () => Language,
	Lint: () => Lint,
	Linter: () => Linter,
	OrganizedGroup: () => OrganizedGroup,
	Span: () => Span,
	Suggestion: () => Suggestion,
	SuggestionKind: () => SuggestionKind,
	default: () => __wbg_init,
	get_default_lint_config: () => get_default_lint_config,
	get_default_lint_config_as_json: () => get_default_lint_config_as_json,
	initSync: () => initSync,
	setup: () => setup,
	to_title_case: () => to_title_case
});
/**
* Specifies an English Dialect, often used for linting.
* @enum {0 | 1 | 2 | 3 | 4}
*/
const Dialect = Object.freeze({
	American: 0,
	"0": "American",
	British: 1,
	"1": "British",
	Australian: 2,
	"2": "Australian",
	Canadian: 3,
	"3": "Canadian",
	Indian: 4,
	"4": "Indian"
});
/**
* @enum {0 | 1 | 2}
*/
const Language = Object.freeze({
	Plain: 0,
	"0": "Plain",
	Markdown: 1,
	"1": "Markdown",
	Typst: 2,
	"2": "Typst"
});
/**
* An error found in provided text.
*
* May include zero or more suggestions that may fix the problematic text.
*/
var Lint = class Lint {
	static __wrap(ptr) {
		const obj = Object.create(Lint.prototype);
		obj.__wbg_ptr = ptr;
		LintFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	static __unwrap(jsValue) {
		if (!(jsValue instanceof Lint)) return 0;
		return jsValue.__destroy_into_raw();
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		LintFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_lint_free(ptr, 0);
	}
	/**
	* @param {string} json
	* @returns {Lint}
	*/
	static from_json(json) {
		const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.lint_from_json(ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0(ret[1]);
		return Lint.__wrap(ret[0]);
	}
	/**
	* Get the content of the source material pointed to by [\`Self::span\`]
	* @returns {string}
	*/
	get_problem_text() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.lint_get_problem_text(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a string representing the general category of the lint.
	* @returns {string}
	*/
	lint_kind() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.lint_lint_kind(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a string representing the general category of the lint.
	* @returns {string}
	*/
	lint_kind_pretty() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.lint_lint_kind_pretty(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a description of the error.
	* @returns {string}
	*/
	message() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.lint_message(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a description of the error as HTML.
	* @returns {string}
	*/
	message_html() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.lint_message_html(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get the location of the problematic text.
	* @returns {Span}
	*/
	span() {
		const ret = wasm.lint_span(this.__wbg_ptr);
		return Span.__wrap(ret);
	}
	/**
	* Equivalent to calling \`.length\` on the result of \`suggestions()\`.
	* @returns {number}
	*/
	suggestion_count() {
		return wasm.lint_suggestion_count(this.__wbg_ptr) >>> 0;
	}
	/**
	* Get an array of any suggestions that may resolve the issue.
	* @returns {Suggestion[]}
	*/
	suggestions() {
		const ret = wasm.lint_suggestions(this.__wbg_ptr);
		var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
		wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v1;
	}
	/**
	* @returns {string}
	*/
	to_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.lint_to_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
};
if (Symbol.dispose) Lint.prototype[Symbol.dispose] = Lint.prototype.free;
var Linter = class Linter {
	static __wrap(ptr) {
		const obj = Object.create(Linter.prototype);
		obj.__wbg_ptr = ptr;
		LinterFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		LinterFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_linter_free(ptr, 0);
	}
	/**
	* Apply a suggestion from a given lint.
	* This action will be logged to the Linter's statistics.
	* @param {string} source_text
	* @param {Lint} lint
	* @param {Suggestion} suggestion
	* @returns {string}
	*/
	apply_suggestion(source_text, lint, suggestion) {
		let deferred3_0;
		let deferred3_1;
		try {
			const ptr0 = passStringToWasm0(source_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
			const len0 = WASM_VECTOR_LEN;
			_assertClass(lint, Lint);
			_assertClass(suggestion, Suggestion);
			const ret = wasm.linter_apply_suggestion(this.__wbg_ptr, ptr0, len0, lint.__wbg_ptr, suggestion.__wbg_ptr);
			var ptr2 = ret[0];
			var len2 = ret[1];
			if (ret[3]) {
				ptr2 = 0;
				len2 = 0;
				throw takeFromExternrefTable0(ret[2]);
			}
			deferred3_0 = ptr2;
			deferred3_1 = len2;
			return getStringFromWasm0(ptr2, len2);
		} finally {
			wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
		}
	}
	clear_ignored_lints() {
		wasm.linter_clear_ignored_lints(this.__wbg_ptr);
	}
	/**
	* Clear the user dictionary.
	*/
	clear_words() {
		wasm.linter_clear_words(this.__wbg_ptr);
	}
	/**
	* Compute the context hash of a given lint.
	* @param {string} source_text
	* @param {Lint} lint
	* @returns {bigint}
	*/
	context_hash(source_text, lint) {
		const ptr0 = passStringToWasm0(source_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		_assertClass(lint, Lint);
		const ret = wasm.linter_context_hash(this.__wbg_ptr, ptr0, len0, lint.__wbg_ptr);
		return BigInt.asUintN(64, ret);
	}
	/**
	* Export the linter's ignored lints as a privacy-respecting JSON list of hashes.
	* @returns {string}
	*/
	export_ignored_lints() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.linter_export_ignored_lints(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Export words from the dictionary.
	* Note: this will only return words previously added by [\`Self::import_words\`].
	* @returns {string[]}
	*/
	export_words() {
		const ret = wasm.linter_export_words(this.__wbg_ptr);
		var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
		wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v1;
	}
	/**
	* @returns {string}
	*/
	generate_stats_file() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.linter_generate_stats_file(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get the dialect this struct was constructed for.
	* @returns {Dialect}
	*/
	get_dialect() {
		return wasm.linter_get_dialect(this.__wbg_ptr);
	}
	/**
	* @returns {string}
	*/
	get_lint_config_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.linter_get_lint_config_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {any}
	*/
	get_lint_config_as_object() {
		return wasm.linter_get_lint_config_as_object(this.__wbg_ptr);
	}
	/**
	* Get a JSON map containing the descriptions of all the linting rules, formatted as Markdown.
	* @returns {string}
	*/
	get_lint_descriptions_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.linter_get_lint_descriptions_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a Record containing the descriptions of all the linting rules, formatted as Markdown.
	* @returns {any}
	*/
	get_lint_descriptions_as_object() {
		return wasm.linter_get_lint_descriptions_as_object(this.__wbg_ptr);
	}
	/**
	* Get a JSON map containing the descriptions of all the linting rules, formatted as HTML.
	* @returns {string}
	*/
	get_lint_descriptions_html_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.linter_get_lint_descriptions_html_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* Get a Record containing the descriptions of all the linting rules, formatted as HTML.
	* @returns {any}
	*/
	get_lint_descriptions_html_as_object() {
		return wasm.linter_get_lint_descriptions_html_as_object(this.__wbg_ptr);
	}
	/**
	* @returns {string}
	*/
	get_structured_lint_config_as_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.linter_get_structured_lint_config_as_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {any}
	*/
	get_structured_lint_config_as_object() {
		return wasm.linter_get_structured_lint_config_as_object(this.__wbg_ptr);
	}
	/**
	* Add a specific context hash to the ignored lints list.
	* @param {BigUint64Array} hashes
	*/
	ignore_hashes(hashes) {
		const ptr0 = passArray64ToWasm0(hashes, wasm.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN;
		wasm.linter_ignore_hashes(this.__wbg_ptr, ptr0, len0);
	}
	/**
	* @param {string} source_text
	* @param {Lint[]} lints
	*/
	ignore_lints(source_text, lints) {
		const ptr0 = passStringToWasm0(source_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passArrayJsValueToWasm0(lints, wasm.__wbindgen_malloc);
		const len1 = WASM_VECTOR_LEN;
		wasm.linter_ignore_lints(this.__wbg_ptr, ptr0, len0, ptr1, len1);
	}
	/**
	* Import into the linter's ignored lints from a privacy-respecting JSON list of hashes.
	* @param {string} json
	*/
	import_ignored_lints(json) {
		const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.linter_import_ignored_lints(this.__wbg_ptr, ptr0, len0);
		if (ret[1]) throw takeFromExternrefTable0(ret[0]);
	}
	/**
	* @param {string} file
	*/
	import_stats_file(file) {
		const ptr0 = passStringToWasm0(file, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.linter_import_stats_file(this.__wbg_ptr, ptr0, len0);
		if (ret[1]) throw takeFromExternrefTable0(ret[0]);
	}
	/**
	* Load a Weirpack from raw bytes, merging its rules into the current linter.
	* Returns test failures if any are found, and does not import in that case.
	* @param {Uint8Array} bytes
	* @returns {any}
	*/
	import_weirpack(bytes) {
		const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.linter_import_weirpack(this.__wbg_ptr, ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0(ret[1]);
		return takeFromExternrefTable0(ret[0]);
	}
	/**
	* Import words into the dictionary.
	* @param {string[]} additional_words
	*/
	import_words(additional_words) {
		const ptr0 = passArrayJsValueToWasm0(additional_words, wasm.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN;
		wasm.linter_import_words(this.__wbg_ptr, ptr0, len0);
	}
	/**
	* Helper method to quickly check if a plain string is likely intended to be English
	* @param {string} text
	* @returns {boolean}
	*/
	is_likely_english(text) {
		const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		return wasm.linter_is_likely_english(this.__wbg_ptr, ptr0, len0) !== 0;
	}
	/**
	* Helper method to remove non-English text from a plain English document.
	* @param {string} text
	* @returns {string}
	*/
	isolate_english(text) {
		let deferred2_0;
		let deferred2_1;
		try {
			const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
			const len0 = WASM_VECTOR_LEN;
			const ret = wasm.linter_isolate_english(this.__wbg_ptr, ptr0, len0);
			deferred2_0 = ret[0];
			deferred2_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
		}
	}
	/**
	* Perform the configured linting on the provided text.
	*
	* If the provided regex mask cannot be parsed, this method will return an empty array.
	* @param {string} text
	* @param {Language} language
	* @param {boolean} all_headings
	* @param {string | null | undefined} regex_mask
	* @param {boolean} dedup
	* @param {boolean} isolate_english
	* @returns {Lint[]}
	*/
	lint(text, language, all_headings, regex_mask, dedup, isolate_english) {
		const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		var ptr1 = isLikeNone(regex_mask) ? 0 : passStringToWasm0(regex_mask, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		var len1 = WASM_VECTOR_LEN;
		const ret = wasm.linter_lint(this.__wbg_ptr, ptr0, len0, language, all_headings, ptr1, len1, dedup, isolate_english);
		var v3 = getArrayJsValueFromWasm0(ret[0], ret[1]);
		wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v3;
	}
	/**
	* Construct a new \`Linter\`.
	* Note that this can mean constructing the curated dictionary, which is the most expensive operation
	* in Harper.
	* @param {Dialect} dialect
	* @returns {Linter}
	*/
	static new(dialect) {
		const ret = wasm.linter_new(dialect);
		return Linter.__wrap(ret);
	}
	/**
	* @param {string} text
	* @param {Language} language
	* @param {boolean} all_headings
	* @param {string | null | undefined} regex_mask
	* @param {boolean} dedup
	* @param {boolean} isolate_english
	* @returns {OrganizedGroup[]}
	*/
	organized_lints(text, language, all_headings, regex_mask, dedup, isolate_english) {
		const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		var ptr1 = isLikeNone(regex_mask) ? 0 : passStringToWasm0(regex_mask, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		var len1 = WASM_VECTOR_LEN;
		const ret = wasm.linter_organized_lints(this.__wbg_ptr, ptr0, len0, language, all_headings, ptr1, len1, dedup, isolate_english);
		var v3 = getArrayJsValueFromWasm0(ret[0], ret[1]);
		wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v3;
	}
	/**
	* @param {string} json
	*/
	set_lint_config_from_json(json) {
		const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.linter_set_lint_config_from_json(this.__wbg_ptr, ptr0, len0);
		if (ret[1]) throw takeFromExternrefTable0(ret[0]);
	}
	/**
	* @param {any} object
	*/
	set_lint_config_from_object(object) {
		const ret = wasm.linter_set_lint_config_from_object(this.__wbg_ptr, object);
		if (ret[1]) throw takeFromExternrefTable0(ret[0]);
	}
	/**
	* @param {bigint | null} [start_time]
	* @param {bigint | null} [end_time]
	* @returns {any}
	*/
	summarize_stats(start_time, end_time) {
		return wasm.linter_summarize_stats(this.__wbg_ptr, !isLikeNone(start_time), isLikeNone(start_time) ? BigInt(0) : start_time, !isLikeNone(end_time), isLikeNone(end_time) ? BigInt(0) : end_time);
	}
};
if (Symbol.dispose) Linter.prototype[Symbol.dispose] = Linter.prototype.free;
/**
* Used exclusively for [\`Linter::organized_lints\`]
*/
var OrganizedGroup = class OrganizedGroup {
	static __wrap(ptr) {
		const obj = Object.create(OrganizedGroup.prototype);
		obj.__wbg_ptr = ptr;
		OrganizedGroupFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		OrganizedGroupFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_organizedgroup_free(ptr, 0);
	}
	/**
	* @returns {string}
	*/
	get group() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.__wbg_get_organizedgroup_group(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {Lint[]}
	*/
	get lints() {
		const ret = wasm.__wbg_get_organizedgroup_lints(this.__wbg_ptr);
		var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
		wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
		return v1;
	}
	/**
	* @param {string} arg0
	*/
	set group(arg0) {
		const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		wasm.__wbg_set_organizedgroup_group(this.__wbg_ptr, ptr0, len0);
	}
	/**
	* @param {Lint[]} arg0
	*/
	set lints(arg0) {
		const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
		const len0 = WASM_VECTOR_LEN;
		wasm.__wbg_set_organizedgroup_lints(this.__wbg_ptr, ptr0, len0);
	}
};
if (Symbol.dispose) OrganizedGroup.prototype[Symbol.dispose] = OrganizedGroup.prototype.free;
/**
* A struct that represents two character indices in a string: a start and an end.
*/
var Span = class Span {
	static __wrap(ptr) {
		const obj = Object.create(Span.prototype);
		obj.__wbg_ptr = ptr;
		SpanFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		SpanFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_span_free(ptr, 0);
	}
	/**
	* @returns {number}
	*/
	get end() {
		return wasm.__wbg_get_span_end(this.__wbg_ptr) >>> 0;
	}
	/**
	* @returns {number}
	*/
	get start() {
		return wasm.__wbg_get_span_start(this.__wbg_ptr) >>> 0;
	}
	/**
	* @param {number} arg0
	*/
	set end(arg0) {
		wasm.__wbg_set_span_end(this.__wbg_ptr, arg0);
	}
	/**
	* @param {number} arg0
	*/
	set start(arg0) {
		wasm.__wbg_set_span_start(this.__wbg_ptr, arg0);
	}
	/**
	* @param {string} json
	* @returns {Span}
	*/
	static from_json(json) {
		const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.span_from_json(ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0(ret[1]);
		return Span.__wrap(ret[0]);
	}
	/**
	* @returns {boolean}
	*/
	is_empty() {
		return wasm.span_is_empty(this.__wbg_ptr) !== 0;
	}
	/**
	* @returns {number}
	*/
	len() {
		return wasm.span_len(this.__wbg_ptr) >>> 0;
	}
	/**
	* @param {number} start
	* @param {number} end
	* @returns {Span}
	*/
	static new(start, end) {
		const ret = wasm.span_new(start, end);
		return Span.__wrap(ret);
	}
	/**
	* @returns {string}
	*/
	to_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.span_to_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
};
if (Symbol.dispose) Span.prototype[Symbol.dispose] = Span.prototype.free;
/**
* A suggestion to fix a Lint.
*/
var Suggestion = class Suggestion {
	static __wrap(ptr) {
		const obj = Object.create(Suggestion.prototype);
		obj.__wbg_ptr = ptr;
		SuggestionFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		SuggestionFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_suggestion_free(ptr, 0);
	}
	/**
	* @param {string} json
	* @returns {Suggestion}
	*/
	static from_json(json) {
		const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.suggestion_from_json(ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0(ret[1]);
		return Suggestion.__wrap(ret[0]);
	}
	/**
	* Get the text that is going to replace the problematic section.
	* If [\`Self::kind\`] is \`SuggestionKind::Remove\`, this will return an empty
	* string.
	* @returns {string}
	*/
	get_replacement_text() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.suggestion_get_replacement_text(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
	/**
	* @returns {SuggestionKind}
	*/
	kind() {
		return wasm.suggestion_kind(this.__wbg_ptr);
	}
	/**
	* @returns {string}
	*/
	to_json() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.suggestion_to_json(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
		}
	}
};
if (Symbol.dispose) Suggestion.prototype[Symbol.dispose] = Suggestion.prototype.free;
/**
* Tags the variant of suggestion.
* @enum {0 | 1 | 2}
*/
const SuggestionKind = Object.freeze({
	/**
	* Replace the problematic text.
	*/
	Replace: 0,
	"0": "Replace",
	/**
	* Remove the problematic text.
	*/
	Remove: 1,
	"1": "Remove",
	/**
	* Insert additional text after the error.
	*/
	InsertAfter: 2,
	"2": "InsertAfter"
});
/**
* @returns {any}
*/
function get_default_lint_config() {
	return wasm.get_default_lint_config();
}
/**
* @returns {string}
*/
function get_default_lint_config_as_json() {
	let deferred1_0;
	let deferred1_1;
	try {
		const ret = wasm.get_default_lint_config_as_json();
		deferred1_0 = ret[0];
		deferred1_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
	}
}
/**
* Set up the WebAssembly module's logging.
*/
function setup() {
	wasm.setup();
}
/**
* @param {string} text
* @returns {string}
*/
function to_title_case(text) {
	let deferred2_0;
	let deferred2_1;
	try {
		const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.to_title_case(ptr0, len0);
		deferred2_0 = ret[0];
		deferred2_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
	}
}
function __wbg_get_imports() {
	return {
		__proto__: null,
		"./harper_wasm_bg.js": {
			__proto__: null,
			__wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
				return Error(getStringFromWasm0(arg0, arg1));
			},
			__wbg_String_8564e559799eccda: function(arg0, arg1) {
				const ptr1 = passStringToWasm0(String(arg1), wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
				const v = arg0;
				const ret = typeof v === "boolean" ? v : void 0;
				return isLikeNone(ret) ? 16777215 : ret ? 1 : 0;
			},
			__wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
				const ptr1 = passStringToWasm0(debugString(arg1), wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
				return typeof arg0 === "function";
			},
			__wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
				const val = arg0;
				return typeof val === "object" && val !== null;
			},
			__wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
				return typeof arg0 === "string";
			},
			__wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
				return arg0 == arg1;
			},
			__wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
				const obj = arg1;
				const ret = typeof obj === "number" ? obj : void 0;
				getDataViewMemory0().setFloat64(arg0 + 8, isLikeNone(ret) ? 0 : ret, true);
				getDataViewMemory0().setInt32(arg0 + 0, !isLikeNone(ret), true);
			},
			__wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
				const obj = arg1;
				const ret = typeof obj === "string" ? obj : void 0;
				var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
				var len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
				throw new Error(getStringFromWasm0(arg0, arg1));
			},
			__wbg_call_6137034ef55c9d0f: function() {
				return handleError(function(arg0, arg1) {
					return arg0.call(arg1);
				}, arguments);
			},
			__wbg_done_b41a1d26cdb37fb6: function(arg0) {
				return arg0.done;
			},
			__wbg_entries_fb6397112b1de25f: function(arg0) {
				return Object.entries(arg0);
			},
			__wbg_error_757e9472f8410341: function(arg0, arg1) {
				let deferred0_0;
				let deferred0_1;
				try {
					deferred0_0 = arg0;
					deferred0_1 = arg1;
					console.error(getStringFromWasm0(arg0, arg1));
				} finally {
					wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
				}
			},
			__wbg_getRandomValues_973dabfb0ad1769f: function() {
				return handleError(function(arg0, arg1) {
					globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
				}, arguments);
			},
			__wbg_getRandomValues_a608c4436c19407a: function() {
				return handleError(function(arg0, arg1) {
					globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
				}, arguments);
			},
			__wbg_getTime_f5a55efff2585d5d: function(arg0) {
				return arg0.getTime();
			},
			__wbg_get_658f6698067d9515: function() {
				return handleError(function(arg0, arg1) {
					return Reflect.get(arg0, arg1);
				}, arguments);
			},
			__wbg_get_6c896e0571ddae51: function(arg0, arg1) {
				return arg0[arg1 >>> 0];
			},
			__wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
				return arg0[arg1 >>> 0];
			},
			__wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
				let result;
				try {
					result = arg0 instanceof ArrayBuffer;
				} catch (_) {
					result = false;
				}
				return result;
			},
			__wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
				let result;
				try {
					result = arg0 instanceof Uint8Array;
				} catch (_) {
					result = false;
				}
				return result;
			},
			__wbg_iterator_e3c31c892080e444: function() {
				return Symbol.iterator;
			},
			__wbg_length_7f3c00c40364105e: function(arg0) {
				return arg0.length;
			},
			__wbg_length_d4bdea10311bd9cf: function(arg0) {
				return arg0.length;
			},
			__wbg_lint_new: function(arg0) {
				return Lint.__wrap(arg0);
			},
			__wbg_lint_unwrap: function(arg0) {
				return Lint.__unwrap(arg0);
			},
			__wbg_log_1f8cbb01c83d06c2: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
				let deferred0_0;
				let deferred0_1;
				try {
					deferred0_0 = arg0;
					deferred0_1 = arg1;
					console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
				} finally {
					wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
				}
			},
			__wbg_log_a54ca6b45e09078a: function(arg0, arg1) {
				let deferred0_0;
				let deferred0_1;
				try {
					deferred0_0 = arg0;
					deferred0_1 = arg1;
					console.log(getStringFromWasm0(arg0, arg1));
				} finally {
					wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
				}
			},
			__wbg_mark_6b7f03786f5e4d61: function(arg0, arg1) {
				performance.mark(getStringFromWasm0(arg0, arg1));
			},
			__wbg_measure_0e21b33a1c6e3a29: function() {
				return handleError(function(arg0, arg1, arg2, arg3) {
					let deferred0_0;
					let deferred0_1;
					let deferred1_0;
					let deferred1_1;
					try {
						deferred0_0 = arg0;
						deferred0_1 = arg1;
						deferred1_0 = arg2;
						deferred1_1 = arg3;
						performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
					} finally {
						wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
						wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
					}
				}, arguments);
			},
			__wbg_new_0_72d020f0c63443d4: function() {
				return /* @__PURE__ */ new Date();
			},
			__wbg_new_1dbf7428bba60a42: function(arg0) {
				return new Uint8Array(arg0);
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ new Error();
			},
			__wbg_new_28744009d011f847: function() {
				return /* @__PURE__ */ new Map();
			},
			__wbg_new_617a8cdb8bb1130e: function() {
				return /* @__PURE__ */ new Object();
			},
			__wbg_new_ee2291f50781bf1d: function() {
				return new Array();
			},
			__wbg_next_33784799010f1bbe: function(arg0) {
				return arg0.next;
			},
			__wbg_next_f4aac29c42af995c: function() {
				return handleError(function(arg0) {
					return arg0.next();
				}, arguments);
			},
			__wbg_organizedgroup_new: function(arg0) {
				return OrganizedGroup.__wrap(arg0);
			},
			__wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
				Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
			},
			__wbg_set_6ae97e73113c4f0b: function(arg0, arg1, arg2) {
				return arg0.set(arg1, arg2);
			},
			__wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
				arg0[arg1] = arg2;
			},
			__wbg_set_bea140a88be9b277: function(arg0, arg1, arg2) {
				arg0[arg1 >>> 0] = arg2;
			},
			__wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
				const ret = arg1.stack;
				const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4, len1, true);
				getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
			},
			__wbg_suggestion_new: function(arg0) {
				return Suggestion.__wrap(arg0);
			},
			__wbg_value_f3c585ee8f5ba40c: function(arg0) {
				return arg0.value;
			},
			__wbindgen_generic_0000000000000001: function(arg0) {
				return arg0;
			},
			__wbindgen_generic_0000000000000002: function(arg0, arg1) {
				return getStringFromWasm0(arg0, arg1);
			},
			__wbindgen_init_externref_table: function() {
				const table = wasm.__wbindgen_externrefs;
				const offset = table.grow(4);
				table.set(0, void 0);
				table.set(offset + 0, void 0);
				table.set(offset + 1, null);
				table.set(offset + 2, true);
				table.set(offset + 3, false);
			}
		}
	};
}
const LintFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_lint_free(ptr, 1));
const LinterFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_linter_free(ptr, 1));
const OrganizedGroupFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_organizedgroup_free(ptr, 1));
const SpanFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_span_free(ptr, 1));
const SuggestionFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_suggestion_free(ptr, 1));
function addToExternrefTable0(obj) {
	const idx = wasm.__externref_table_alloc();
	wasm.__wbindgen_externrefs.set(idx, obj);
	return idx;
}
function _assertClass(instance, klass) {
	if (!(instance instanceof klass)) throw new Error(\`expected instance of \${klass.name}\`);
}
function debugString(val) {
	const type = typeof val;
	if (type == "number" || type == "boolean" || val == null) return \`\${val}\`;
	if (type == "string") return \`"\${val}"\`;
	if (type == "symbol") {
		const description = val.description;
		if (description == null) return "Symbol";
		else return \`Symbol(\${description})\`;
	}
	if (type == "function") {
		const name = val.name;
		if (typeof name == "string" && name.length > 0) return \`Function(\${name})\`;
		else return "Function";
	}
	if (Array.isArray(val)) {
		const length = val.length;
		let debug = "[";
		if (length > 0) debug += debugString(val[0]);
		for (let i = 1; i < length; i++) debug += ", " + debugString(val[i]);
		debug += "]";
		return debug;
	}
	const builtInMatches = /\\[object ([^\\]]+)\\]/.exec(toString.call(val));
	let className;
	if (builtInMatches && builtInMatches.length > 1) className = builtInMatches[1];
	else return toString.call(val);
	if (className == "Object") try {
		return "Object(" + JSON.stringify(val) + ")";
	} catch (_) {
		return "Object";
	}
	if (val instanceof Error) return \`\${val.name}: \${val.message}\\n\${val.stack}\`;
	return className;
}
function getArrayJsValueFromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	const mem = getDataViewMemory0();
	const result = [];
	for (let i = ptr; i < ptr + 4 * len; i += 4) result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
	wasm.__externref_drop_slice(ptr, len);
	return result;
}
function getArrayU8FromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
	if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
	return cachedBigUint64ArrayMemory0;
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
	if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
	return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
	return decodeText(ptr >>> 0, len);
}
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
	if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	return cachedUint8ArrayMemory0;
}
function handleError(f, args) {
	try {
		return f.apply(this, args);
	} catch (e) {
		const idx = addToExternrefTable0(e);
		wasm.__wbindgen_exn_store(idx);
	}
}
function isLikeNone(x) {
	return x === void 0 || x === null;
}
function passArray64ToWasm0(arg, malloc) {
	const ptr = malloc(arg.length * 8, 8) >>> 0;
	getBigUint64ArrayMemory0().set(arg, ptr / 8);
	WASM_VECTOR_LEN = arg.length;
	return ptr;
}
function passArray8ToWasm0(arg, malloc) {
	const ptr = malloc(arg.length * 1, 1) >>> 0;
	getUint8ArrayMemory0().set(arg, ptr / 1);
	WASM_VECTOR_LEN = arg.length;
	return ptr;
}
function passArrayJsValueToWasm0(array, malloc) {
	const ptr = malloc(array.length * 4, 4) >>> 0;
	for (let i = 0; i < array.length; i++) {
		const add = addToExternrefTable0(array[i]);
		getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
	}
	WASM_VECTOR_LEN = array.length;
	return ptr;
}
function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === void 0) {
		const buf = cachedTextEncoder.encode(arg);
		const ptr = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr;
	}
	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;
	const mem = getUint8ArrayMemory0();
	let offset = 0;
	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 127) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) arg = arg.slice(offset);
		ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
		const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
		const ret = cachedTextEncoder.encodeInto(arg, view);
		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}
	WASM_VECTOR_LEN = offset;
	return ptr;
}
function takeFromExternrefTable0(idx) {
	const value = wasm.__wbindgen_externrefs.get(idx);
	wasm.__externref_table_dealloc(idx);
	return value;
}
let cachedTextDecoder = new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true
});
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
	numBytesDecoded += len;
	if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
		cachedTextDecoder = new TextDecoder("utf-8", {
			ignoreBOM: true,
			fatal: true
		});
		cachedTextDecoder.decode();
		numBytesDecoded = len;
	}
	return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
const cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) cachedTextEncoder.encodeInto = function(arg, view) {
	const buf = cachedTextEncoder.encode(arg);
	view.set(buf);
	return {
		read: arg.length,
		written: buf.length
	};
};
let WASM_VECTOR_LEN = 0;
let wasm;
function __wbg_finalize_init(instance, module) {
	wasm = instance.exports;
	cachedBigUint64ArrayMemory0 = null;
	cachedDataViewMemory0 = null;
	cachedUint8ArrayMemory0 = null;
	wasm.__wbindgen_start();
	return wasm;
}
async function __wbg_load(module, imports) {
	if (typeof Response === "function" && module instanceof Response) {
		if (!module.ok) throw new Error(\`failed to fetch Wasm: \${module.status} \${module.statusText} fetching '\${module.url}'\`);
		if (typeof WebAssembly.instantiateStreaming === "function") try {
			return await WebAssembly.instantiateStreaming(module, imports);
		} catch (e) {
			if (expectedResponseType(module.type) && module.headers.get("Content-Type") !== "application/wasm") console.warn("\`WebAssembly.instantiateStreaming\` failed because your server does not serve Wasm with \`application/wasm\` MIME type. Falling back to \`WebAssembly.instantiate\` which is slower. Original error:\\n", e);
			else throw e;
		}
		const bytes = await module.arrayBuffer();
		return await WebAssembly.instantiate(bytes, imports);
	} else {
		const instance = await WebAssembly.instantiate(module, imports);
		if (instance instanceof WebAssembly.Instance) return {
			instance,
			module
		};
		else return instance;
	}
	function expectedResponseType(type) {
		switch (type) {
			case "basic":
			case "cors":
			case "default": return true;
		}
		return false;
	}
}
function initSync(module) {
	if (wasm !== void 0) return wasm;
	if (module !== void 0) {
		if (Object.getPrototypeOf(module) === Object.prototype) ({module} = module);
		else console.warn("using deprecated parameters for \`initSync()\`; pass a single object instead");
	}
	const imports = __wbg_get_imports();
	if (!(module instanceof WebAssembly.Module)) module = new WebAssembly.Module(module);
	return __wbg_finalize_init(new WebAssembly.Instance(module, imports), module);
}
async function __wbg_init(module_or_path) {
	if (wasm !== void 0) return wasm;
	if (module_or_path !== void 0) {
		if (Object.getPrototypeOf(module_or_path) === Object.prototype) ({module_or_path} = module_or_path);
		else console.warn("using deprecated parameters for the initialization function; pass a single object instead");
	}
	if (module_or_path === void 0) module_or_path = new URL();
	const imports = __wbg_get_imports();
	if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) module_or_path = fetch(module_or_path);
	const { instance, module } = await __wbg_load(await module_or_path, imports);
	return __wbg_finalize_init(instance, module);
}
// ../../node_modules/.pnpm/p-lazy@5.0.0/node_modules/p-lazy/index.js
var PLazy = class PLazy extends Promise {
	#executor;
	#promise;
	constructor(executor) {
		super((resolve) => {
			resolve();
		});
		this.#executor = executor;
	}
	static from(function_) {
		return new PLazy((resolve) => {
			resolve(function_());
		});
	}
	static resolve(value) {
		return new PLazy((resolve) => {
			resolve(value);
		});
	}
	static reject(error) {
		return new PLazy((resolve, reject) => {
			reject(error);
		});
	}
	then(onFulfilled, onRejected) {
		this.#promise ??= new Promise(this.#executor);
		return this.#promise.then(onFulfilled, onRejected);
	}
	catch(onRejected) {
		this.#promise ??= new Promise(this.#executor);
		return this.#promise.catch(onRejected);
	}
	finally(onFinally) {
		this.#promise ??= new Promise(this.#executor);
		return this.#promise.finally(onFinally);
	}
};
// ../../node_modules/.pnpm/mimic-fn@4.0.0/node_modules/mimic-fn/index.js
const copyProperty = (to, from, property, ignoreNonConfigurable) => {
	if (property === "length" || property === "prototype") return;
	if (property === "arguments" || property === "caller") return;
	const toDescriptor = Object.getOwnPropertyDescriptor(to, property);
	const fromDescriptor = Object.getOwnPropertyDescriptor(from, property);
	if (!canCopyProperty(toDescriptor, fromDescriptor) && ignoreNonConfigurable) return;
	Object.defineProperty(to, property, fromDescriptor);
};
const canCopyProperty = function(toDescriptor, fromDescriptor) {
	return toDescriptor === void 0 || toDescriptor.configurable || toDescriptor.writable === fromDescriptor.writable && toDescriptor.enumerable === fromDescriptor.enumerable && toDescriptor.configurable === fromDescriptor.configurable && (toDescriptor.writable || toDescriptor.value === fromDescriptor.value);
};
const changePrototype = (to, from) => {
	const fromPrototype = Object.getPrototypeOf(from);
	if (fromPrototype === Object.getPrototypeOf(to)) return;
	Object.setPrototypeOf(to, fromPrototype);
};
const wrappedToString = (withName, fromBody) => \`/* Wrapped \${withName}*/\\n\${fromBody}\`;
const toStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
const toStringName = Object.getOwnPropertyDescriptor(Function.prototype.toString, "name");
const changeToString = (to, from, name) => {
	const withName = name === "" ? "" : \`with \${name.trim()}() \`;
	const newToString = wrappedToString.bind(null, withName, from.toString());
	Object.defineProperty(newToString, "name", toStringName);
	Object.defineProperty(to, "toString", {
		...toStringDescriptor,
		value: newToString
	});
};
function mimicFunction(to, from, { ignoreNonConfigurable = false } = {}) {
	const { name } = to;
	for (const property of Reflect.ownKeys(from)) copyProperty(to, from, property, ignoreNonConfigurable);
	changePrototype(to, from);
	changeToString(to, from, name);
	return to;
}
// ../../node_modules/.pnpm/p-memoize@7.1.1/node_modules/p-memoize/dist/index.js
const cacheStore = /* @__PURE__ */ new WeakMap();
/**
[Memoize](https://en.wikipedia.org/wiki/Memoization) functions - An optimization used to speed up consecutive function calls by caching the result of calls with identical input.

@param fn - Function to be memoized.

@example
\`\`\`
import {setTimeout as delay} from 'node:timer/promises';
import pMemoize from 'p-memoize';
import got from 'got';

const memoizedGot = pMemoize(got);

await memoizedGot('https://sindresorhus.com');

// This call is cached
await memoizedGot('https://sindresorhus.com');

await delay(2000);

// This call is not cached as the cache has expired
await memoizedGot('https://sindresorhus.com');
\`\`\`
*/
function pMemoize(fn, { cacheKey = ([firstArgument]) => firstArgument, cache = /* @__PURE__ */ new Map() } = {}) {
	const promiseCache = /* @__PURE__ */ new Map();
	const memoized = function(...arguments_) {
		const key = cacheKey(arguments_);
		if (promiseCache.has(key)) return promiseCache.get(key);
		const promise = (async () => {
			try {
				if (cache && await cache.has(key)) return await cache.get(key);
				const result = await fn.apply(this, arguments_);
				try {
					return result;
				} finally {
					if (cache) await cache.set(key, result);
				}
			} finally {
				promiseCache.delete(key);
			}
		})();
		promiseCache.set(key, promise);
		return promise;
	};
	mimicFunction(memoized, fn, { ignoreNonConfigurable: true });
	cacheStore.set(memoized, cache);
	return memoized;
}
// src/BinaryModule.ts
function inferGlueFlavor(binary) {
	return binary.includes("harper_wasm_slim") ? "slim" : "full";
}
function loadGlue(glueFlavor) {
	if (glueFlavor === "slim") return harper_wasm_slim_exports;
	return harper_wasm_exports;
}
function getDefaultGlueBinary(binary, glueFlavor) {
	if (glueFlavor === "slim") return binary;
	if (binary.includes("harper_wasm_bg.wasm")) return binary.replace("harper_wasm_bg.wasm", "harper_wasm_slim_bg.wasm");
	return null;
}
function getInitInput(binary) {
	if (typeof process !== "undefined" && binary.startsWith("file://")) return import(
		/* webpackIgnore: true */
		/* @vite-ignore */
		"fs"
).then((fs) => new Promise((resolve, reject) => {
		fs.readFile(new URL(binary).pathname, (err, data) => {
			if (err) reject(err);
			resolve(data);
		});
	}));
	return binary;
}
async function loadBinaryUncached(binary, glueFlavor) {
	const exports = loadGlue(glueFlavor);
	const defaultGlueBinary = getDefaultGlueBinary(binary, glueFlavor);
	if (defaultGlueBinary != null) try {
		await __wbg_init$1({ module_or_path: getInitInput(defaultGlueBinary) });
	} catch (err) {
		if (glueFlavor === "slim") throw err;
	}
	await exports.default({ module_or_path: getInitInput(binary) });
	return exports;
}
const loadBinaryByFlavor = {
	full: pMemoize((binary) => loadBinaryUncached(binary, "full")),
	slim: pMemoize((binary) => loadBinaryUncached(binary, "slim"))
};
function loadBinary(binary, glueFlavor) {
	return loadBinaryByFlavor[glueFlavor](binary);
}
/** A wrapper around the underlying WebAssembly module that contains Harper's core code. Used to construct a \`Linter\`, as well as access some miscellaneous other functions. */
var BinaryModuleImpl = class {
	url = "";
	glueFlavor = "full";
	inner = null;
	/** Load a binary from a specified URL. This is the only recommended way to construct this type. */
	static create(url, glueFlavor) {
		const module = new SuperBinaryModule();
		module.url = url;
		module.glueFlavor = glueFlavor ?? inferGlueFlavor(typeof url === "string" ? url : url.href);
		module.inner = PLazy.from(() => loadBinary(typeof module.url === "string" ? module.url : module.url.href, module.glueFlavor));
		return module;
	}
	async getDefaultLintConfigAsJSON() {
		return (await this.inner).get_default_lint_config_as_json();
	}
	async getDefaultLintConfig() {
		return (await this.inner).get_default_lint_config();
	}
	async toTitleCase(text) {
		return (await this.inner).to_title_case(text);
	}
	async setup() {
		(await this.inner).setup();
	}
};
var SuperBinaryModule = class extends BinaryModuleImpl {
	async createLinter(dialect) {
		return (await this.getBinaryModule()).Linter.new(dialect ?? Dialect$1.American);
	}
	async getBinaryModule() {
		return await PLazy.from(() => loadBinary(typeof this.url === "string" ? this.url : this.url.href, this.glueFlavor));
	}
};
// src/LocalLinter.ts
function toWasmLanguage(language) {
	switch (language) {
		case "plaintext": return Language$1.Plain;
		case "typst": return Language$1.Typst;
		case "markdown":
		case void 0: return Language$1.Markdown;
		default:
			console.warn(\`Unknown Harper language '\${String(language)}'; using markdown.\`);
			return Language$1.Markdown;
	}
}
function toWasmLintArgs(text, options) {
	return [
		text,
		toWasmLanguage(options?.language),
		options?.forceAllHeadings ?? false,
		options?.regex_mask,
		options?.dedup ?? true,
		options?.isolateEnglish ?? false
	];
}
/** A Linter that runs in the current JavaScript context (meaning it is allowed to block the event loop).
* See the interface definition for more details. */
var LocalLinter = class {
	binary;
	inner;
	disposed = false;
	constructor(init) {
		this.binary = init.binary;
		this.binary.setup();
		this.inner = this.createInner(init.dialect);
	}
	createInner(dialect) {
		return PLazy.from(async () => {
			await this.binary.setup();
			return this.binary.createLinter(dialect);
		});
	}
	async setup() {
		await this.lint("", { language: "plaintext" });
		const exported = await this.exportIgnoredLints();
		await this.importIgnoredLints(exported);
	}
	async lint(text, options) {
		return (await this.inner).lint(...toWasmLintArgs(text, options));
	}
	async organizedLints(text, options) {
		const lintGroups = (await this.inner).organized_lints(...toWasmLintArgs(text, options));
		const output = {};
		for (const group of lintGroups) {
			output[group.group] = group.lints;
			group.free();
		}
		return output;
	}
	async applySuggestion(text, lint, suggestion) {
		return (await this.inner).apply_suggestion(text, lint, suggestion);
	}
	async isLikelyEnglish(text) {
		return (await this.inner).is_likely_english(text);
	}
	async isolateEnglish(text) {
		return (await this.inner).isolate_english(text);
	}
	async getLintConfig() {
		return (await this.inner).get_lint_config_as_object();
	}
	async getDefaultLintConfigAsJSON() {
		return await this.binary.getDefaultLintConfigAsJSON();
	}
	async getDefaultLintConfig() {
		return await this.binary.getDefaultLintConfig();
	}
	async getStructuredLintConfig() {
		return (await this.inner).get_structured_lint_config_as_object();
	}
	async getStructuredLintConfigJSON() {
		return (await this.inner).get_structured_lint_config_as_json();
	}
	async setLintConfig(config) {
		(await this.inner).set_lint_config_from_object(config);
	}
	async getLintConfigAsJSON() {
		return (await this.inner).get_lint_config_as_json();
	}
	async setLintConfigWithJSON(config) {
		(await this.inner).set_lint_config_from_json(config);
	}
	async toTitleCase(text) {
		return await this.binary.toTitleCase(text);
	}
	async getLintDescriptions() {
		return (await this.inner).get_lint_descriptions_as_object();
	}
	async getLintDescriptionsAsJSON() {
		return (await this.inner).get_lint_descriptions_as_json();
	}
	async getLintDescriptionsHTML() {
		return (await this.inner).get_lint_descriptions_html_as_object();
	}
	async getLintDescriptionsHTMLAsJSON() {
		return (await this.inner).get_lint_descriptions_html_as_json();
	}
	async ignoreLint(source, lint) {
		return await this.ignoreLints(source, [lint]);
	}
	async ignoreLints(source, lints) {
		(await this.inner).ignore_lints(source, lints);
	}
	async ignoreLintHash(hash) {
		(await this.inner).ignore_hashes(new BigUint64Array([hash]));
	}
	async exportIgnoredLints() {
		return (await this.inner).export_ignored_lints();
	}
	async importIgnoredLints(json) {
		(await this.inner).import_ignored_lints(json);
	}
	async contextHash(source, lint) {
		return (await this.inner).context_hash(source, lint);
	}
	async clearIgnoredLints() {
		(await this.inner).clear_ignored_lints();
	}
	async clearWords() {
		return (await this.inner).clear_words();
	}
	async importWords(words) {
		return (await this.inner).import_words(words);
	}
	async exportWords() {
		return (await this.inner).export_words();
	}
	async getDialect() {
		return (await this.inner).get_dialect();
	}
	async setDialect(dialect) {
		const inner = await this.inner;
		if (inner.get_dialect() !== dialect) {
			inner.free();
			this.inner = this.createInner(dialect);
		}
		return Promise.resolve();
	}
	async summarizeStats(start, end) {
		return (await this.inner).summarize_stats(start, end);
	}
	async generateStatsFile() {
		return (await this.inner).generate_stats_file();
	}
	async importStatsFile(statsFile) {
		return (await this.inner).import_stats_file(statsFile);
	}
	/**
	* Load a Weirpack from a Blob.
	*
	* Returns \`undefined\` if tests pass and rules are imported, otherwise returns
	* the Weirpack test failures.
	*/
	async loadWeirpackFromBlob(blob) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		return this.loadWeirpackFromBytes(bytes);
	}
	/**
	* Load a Weirpack from a byte array.
	*
	* Returns \`undefined\` if tests pass and rules are imported, otherwise returns
	* the Weirpack test failures.
	*/
	async loadWeirpackFromBytes(bytes) {
		const inner = await this.inner;
		const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
		return inner.import_weirpack(data);
	}
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		(await this.inner).free();
	}
};
// src/utils.ts
function assert(condition, message) {
	if (!condition) throw new Error(message ?? "Assertion failed");
}
// src/Serializer.ts
function isSerializedRequest(v) {
	return typeof v === "object" && v !== null && "procName" in v && "args" in v;
}
/** An internal class that helps the \`WorkerLinter\` shuffle data across a messaging channel. */
var Serializer = class {
	binary;
	constructor(binary) {
		this.binary = binary;
		this.binary.setup();
	}
	async serializeArg(arg) {
		const { Lint, Span, Suggestion } = await this.binary.getBinaryModule();
		if (Array.isArray(arg)) return {
			json: JSON.stringify(await Promise.all(arg.map((a) => this.serializeArg(a)))),
			type: "Array"
		};
		const argType = typeof arg;
		switch (argType) {
			case "string":
			case "number":
			case "boolean":
			case "undefined": return {
				json: JSON.stringify(arg),
				type: argType
			};
			case "bigint": return {
				json: arg.toString(),
				type: argType
			};
		}
		if (arg.to_json !== void 0) {
			const json = arg.to_json();
			let type;
			const constructorName = arg.constructor?.name;
			if (arg instanceof Lint || constructorName === "Lint") type = "Lint";
			else if (arg instanceof Suggestion || constructorName === "Suggestion") type = "Suggestion";
			else if (arg instanceof Span || constructorName === "Span") type = "Span";
			if (type === void 0) throw new Error("Unhandled case: type undefined");
			return {
				json,
				type
			};
		}
		if (argType == "object") return {
			json: JSON.stringify(await Promise.all(Object.entries(arg).map(([key, value]) => this.serializeArg([key, value])))),
			type: "object"
		};
		throw new Error(\`Unhandled case: \${arg}\`);
	}
	async serialize(req) {
		return {
			procName: req.procName,
			args: await Promise.all(req.args.map((arg) => this.serializeArg(arg)))
		};
	}
	async deserializeArg(requestArg) {
		const { Lint, Span, Suggestion } = await this.binary.getBinaryModule();
		switch (requestArg.type) {
			case "bigint": return BigInt(requestArg.json);
			case "undefined": return;
			case "boolean":
			case "number":
			case "string": return JSON.parse(requestArg.json);
			case "Suggestion": return Suggestion.from_json(requestArg.json);
			case "Lint": return Lint.from_json(requestArg.json);
			case "Span": return Span.from_json(requestArg.json);
			case "Array": {
				const parsed = JSON.parse(requestArg.json);
				assert(Array.isArray(parsed));
				return await Promise.all(parsed.map((arg) => this.deserializeArg(arg)));
			}
			case "object": {
				const parsed = JSON.parse(requestArg.json);
				return Object.fromEntries(await Promise.all(parsed.map((val) => this.deserializeArg(val))));
			}
			default: throw new Error(\`Unhandled case: \${requestArg.type}\`);
		}
	}
	async deserialize(request) {
		return {
			procName: request.procName,
			args: await Promise.all(request.args.map((arg) => this.deserializeArg(arg)))
		};
	}
};
// src/WorkerLinter/worker.ts
self.postMessage("ready");
self.onmessage = (e) => {
	const [binaryUrl, dialect, glueFlavor] = e.data;
	if (typeof binaryUrl !== "string") throw new TypeError(\`Expected binary to be a string of url but got \${typeof binaryUrl}.\`);
	if (glueFlavor !== void 0 && glueFlavor !== "full" && glueFlavor !== "slim") throw new TypeError(\`Expected glue flavor to be "full" or "slim" but got \${glueFlavor}.\`);
	const binary = SuperBinaryModule.create(binaryUrl, glueFlavor);
	const serializer = new Serializer(binary);
	const linter = new LocalLinter({
		binary,
		dialect
	});
	async function processRequest(v) {
		const { procName, args } = await serializer.deserialize(v);
		if (procName in linter) {
			const res = await linter[procName](...args);
			postMessage(await serializer.serializeArg(res));
		}
	}
	self.onmessage = (e) => {
		if (isSerializedRequest(e.data)) processRequest(e.data);
	};
};
`],{type:`text/javascript;charset=utf-8`});var X=Uint8Array,yt=Uint16Array,bt=Int32Array,xt=new X([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),St=new X([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]);new X([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);var Ct=function(e,t){for(var n=new yt(31),r=0;r<31;++r)n[r]=t+=1<<e[r-1];for(var i=new bt(n[30]),r=1;r<30;++r)for(var a=n[r];a<n[r+1];++a)i[a]=a-n[r]<<5|r;return{b:n,r:i}},wt=Ct(xt,2),Tt=wt.b,Et=wt.r;Tt[28]=258,Et[258]=28;var Dt=Ct(St,0);Dt.b,Dt.r;for(var Ot=new yt(32768),Z=0;Z<32768;++Z){var Q=(Z&43690)>>1|(Z&21845)<<1;Q=(Q&52428)>>2|(Q&13107)<<2,Q=(Q&61680)>>4|(Q&3855)<<4,Ot[Z]=((Q&65280)>>8|(Q&255)<<8)>>1}for(var $=new X(288),Z=0;Z<144;++Z)$[Z]=8;for(var Z=144;Z<256;++Z)$[Z]=9;for(var Z=256;Z<280;++Z)$[Z]=7;for(var Z=280;Z<288;++Z)$[Z]=8;for(var kt=new X(32),Z=0;Z<32;++Z)kt[Z]=5;var At=/*#__PURE__*/ new X(0),jt=typeof TextDecoder<`u`&&/*#__PURE__*/ new TextDecoder;try{jt.decode(At,{stream:!0})}catch{}var Mt=new URL(`/assets/harper_wasm_slim_bg-Ul6ANMTB.wasm`,``+import.meta.url).href,Nt=/*@__PURE__*/ mt.create(Mt,`slim`);const Pt={[u.Replace]:`replace`,[u.Remove]:`remove`,[u.InsertAfter]:`insert`};function Ft(e){async function t(t){let n=await e.lint(t);try{return await Promise.all(n.map(async n=>{let r=n.span(),i=n.suggestions().map(e=>{let t={kind:Pt[e.kind()]??`replace`,text:e.get_replacement_text()};return e.free(),t}),a=await e.contextHash(t,n).catch(()=>void 0);return{kind:n.lint_kind_pretty(),message:n.message(),problem:n.get_problem_text(),from:r.start,to:r.end,fixes:i,hash:a}}))}finally{for(let e of n)e.free()}}return{setup:()=>e.setup(),lintPlain:t,importWords:t=>e.importWords(t),exportWords:()=>e.exportWords(),ignoreLintHash:t=>e.ignoreLintHash(t),exportIgnoredLints:()=>e.exportIgnoredLints(),importIgnoredLints:t=>e.importIgnoredLints(t),clearIgnoredLints:()=>e.clearIgnoredLints(),dispose:()=>e.dispose()}}const It=Ft(new vt({binary:Nt}));self.onmessage=async({data:{id:e,method:t,args:n}})=>{try{self.postMessage({id:e,result:await It[t](...n)})}catch(t){self.postMessage({id:e,error:String(t?.message??t)})}};