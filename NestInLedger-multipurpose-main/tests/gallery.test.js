import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";

test("private gallery roles, actual uploads, approvals, storage totals, alerts and downloads", async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Gallery test credentials unavailable");
  const admin = createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });
  const clients={}, ids={}, sessions={}, name=`Gallery verification ${crypto.randomUUID()}`;
  const ok=async(p)=>{const r=await p;if(r.error)throw new Error(r.error.message);return r.data;};
  const originalBudget=await ok(admin.from('gallery_budget').select('*').single());
  const finances=await Promise.all(['payments','expenses'].map(t=>ok(admin.from(t).select('*').order('id'))));
  const fixtureAlbums=[];
  let testGeneration;
  const testStarted = new Date().toISOString();
  try {
    for(const role of ['president','secretary','treasurer','resident']) {
      const email=`gallery-${crypto.randomUUID()}@example.com`,password=`V!${crypto.randomUUID()}z8`;
      const created=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));ids[role]=created.user.id;
      await ok(admin.from('user_roles').insert({user_id:ids[role],role}));
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      sessions[role]=(await ok(client.auth.signInWithPassword({email,password}))).session;clients[role]=client;
    }
    const album=await ok(clients.president.from('gallery_albums').insert({event_name:name+' private',event_date:'2026-10-26'}).select().single());fixtureAlbums.push(album.id);
    expect(await ok(clients.resident.from('gallery_albums').select('id').eq('id',album.id))).toHaveLength(0);
    expect(await ok(clients.treasurer.from('gallery_albums').select('id').eq('id',album.id))).toHaveLength(0);
    expect(await ok(clients.secretary.from('gallery_albums').select('id').eq('id',album.id))).toHaveLength(1);
    expect((await clients.resident.from('gallery_albums').insert({event_name:'forged',event_date:'2026-10-26'})).error).not.toBeNull();
    expect((await clients.treasurer.from('gallery_albums').insert({event_name:'forged',event_date:'2026-10-26'})).error).not.toBeNull();
    await clients.secretary.from('gallery_albums').update({published:true}).eq('id',album.id);
    expect((await ok(admin.from('gallery_albums').select('published').eq('id',album.id).single())).published).toBe(false);
    const proposal=await ok(clients.secretary.rpc('submit_change',{_module:'gallery_albums',_action:'update',_key:album.id,_values:{published:true}}));
    expect((await clients.secretary.rpc('decide_change',{_id:proposal,_approve:true,_comment:''})).error).not.toBeNull();
    await ok(clients.president.rpc('decide_change',{_id:proposal,_approve:true,_comment:'Test approval'}));
    expect(await ok(clients.resident.from('gallery_albums').select('id').eq('id',album.id))).toHaveLength(1);
    expect((await clients.resident.from('gallery_photos').insert({album_id:album.id,upload_id:crypto.randomUUID()})).error).not.toBeNull();
    expect((await clients.president.from('gallery_photos').insert({album_id:album.id,upload_id:crypto.randomUUID()})).error).not.toBeNull();
    const invalid=await ok(clients.secretary.rpc('submit_change',{_module:'gallery_albums',_action:'update',_key:album.id,_values:{event_name:'Rejected gallery name'}}));
    await ok(clients.president.rpc('decide_change',{_id:invalid,_approve:false,_comment:'Reject fixture'}));
    expect((await ok(admin.from('gallery_albums').select('event_name').eq('id',album.id).single())).event_name).toBe(name+' private');
    mkdirSync('/tmp/browser/gallery',{recursive:true});
    writeFileSync('/tmp/browser/gallery/state.json',JSON.stringify({sessions,ids,name,storageKey:`sb-${new URL(url).hostname.split('.')[0]}-auth-token`}),{mode:0o600});
    const browser=Bun.spawn(['python3','tests/gallery-browser.py'],{stdout:'inherit',stderr:'inherit'});expect(await browser.exited).toBe(0);
    const albums=await ok(admin.from('gallery_albums').select('*').in('created_by',Object.values(ids)));fixtureAlbums.push(...albums.map(a=>a.id));
    const uploadedAlbum=albums.find(a=>a.event_name===name);expect(uploadedAlbum).toBeDefined();
    const photos=await ok(admin.from('gallery_photos').select('*').eq('album_id',uploadedAlbum.id));expect(photos).toHaveLength(1);
    expect(Math.max(photos[0].width,photos[0].height)).toBe(1920);
    const upload=await ok(admin.from('gallery_uploads').select('*').eq('id',photos[0].upload_id).single());expect(photos[0].file_size).toBeLessThan(upload.original_size);
    expect((await clients.resident.storage.from('apartment-event-photos').createSignedUrl(photos[0].file_path,60)).error).toBeNull();
    const pending=await ok(admin.from('change_proposals').select('*').eq('module','gallery_photos').eq('submitted_by',ids.secretary).eq('status','pending'));expect(pending).toHaveLength(1);
    const staged=await ok(admin.from('gallery_uploads').select('*').eq('id',pending[0].proposed_values.upload_id).single());
    expect((await clients.resident.storage.from('apartment-event-photos').createSignedUrl(staged.file_path,60)).error).not.toBeNull();
    expect((await clients.treasurer.storage.from('apartment-event-photos').remove([staged.file_path])).data??[]).toHaveLength(0);
    await ok(clients.president.rpc('decide_change',{_id:pending[0].id,_approve:true,_comment:'Approve staged test photo'}));
    expect(await ok(clients.resident.from('gallery_photos').select('id').eq('album_id',uploadedAlbum.id))).toHaveLength(2);
    const photoList=await ok(admin.from('gallery_photos').select('*').eq('album_id',uploadedAlbum.id));
    const measure=await ok(clients.secretary.rpc('measure_gallery_storage'));expect(measure.usedBytes).toBe(photoList.reduce((s,p)=>s+p.file_size+p.thumbnail_size,0));expect(measure.fileCount).toBe(4);
    await ok(clients.president.from('gallery_budget').update({budget_bytes:Math.max(1000000,Math.floor(measure.usedBytes/0.96))}).eq('id',originalBudget.id));
    testGeneration=(await ok(admin.from('gallery_budget').select('generation').single())).generation;
    await ok(clients.secretary.rpc('measure_gallery_storage'));await ok(clients.secretary.rpc('measure_gallery_storage'));
    const alerts=await ok(admin.from('gallery_notifications').select('*').in('recipient_id',Object.values(ids)));
    expect(alerts.filter(a=>a.recipient_id===ids.president).map(a=>a.threshold).sort()).toEqual([70,85,95]);
    expect(alerts.filter(a=>a.recipient_id===ids.secretary)).toHaveLength(3);expect(alerts.filter(a=>a.recipient_id===ids.resident)).toHaveLength(0);
    expect((await clients.resident.rpc('measure_gallery_storage')).error).not.toBeNull();
    expect(await ok(clients.treasurer.from('gallery_notifications').select('*'))).toHaveLength(0);
    await ok(clients.president.from('gallery_albums').update({published:false}).eq('id',uploadedAlbum.id));
    expect((await clients.resident.storage.from('apartment-event-photos').createSignedUrl(photoList[0].file_path,60)).error).not.toBeNull();
    await clients.treasurer.from('gallery_photos').update({deleted:true}).eq('id',photoList[0].id);
    expect((await ok(admin.from('gallery_photos').select('deleted').eq('id',photoList[0].id).single())).deleted).toBe(false);
    const missing=await ok(admin.from('gallery_uploads').insert({album_id:uploadedAlbum.id,uploader:ids.president,file_path:`2026/test/${crypto.randomUUID()}.jpg`,thumbnail_path:`2026/test/${crypto.randomUUID()}-thumb.jpg`,file_name:'failed.jpg'}).select().single());
    expect((await clients.president.from('gallery_photos').insert({album_id:uploadedAlbum.id,upload_id:missing.id})).error).not.toBeNull();
    expect(await Promise.all(['payments','expenses'].map(t=>ok(admin.from(t).select('*').order('id'))))).toEqual(finances);
    console.log(`Verified compression: ${upload.original_size} → ${upload.file_size} bytes; gallery measurement ${measure.usedBytes} bytes including thumbnails.`);
  } finally {
    const ownAlbums=await admin.from('gallery_albums').select('id').in('created_by',Object.values(ids));fixtureAlbums.push(...(ownAlbums.data??[]).map(a=>a.id));
    const uploads=await admin.from('gallery_uploads').select('*').in('album_id',fixtureAlbums);
    const paths=(uploads.data??[]).flatMap(u=>[u.file_path,u.thumbnail_path]);if(paths.length)await admin.storage.from('apartment-event-photos').remove(paths);
    const ps=await admin.from('change_proposals').select('id').in('submitted_by',Object.values(ids));
    for(const p of ps.data??[]){await admin.from('change_audit').delete().eq('proposal_id',p.id);await admin.from('change_proposals').delete().eq('id',p.id);}
    await admin.from('gallery_photos').delete().in('album_id',fixtureAlbums);await admin.from('gallery_uploads').delete().in('album_id',fixtureAlbums);await admin.from('gallery_albums').delete().in('id',fixtureAlbums);
    await admin.from('gallery_budget').update({budget_bytes:originalBudget.budget_bytes}).eq('id',originalBudget.id);
    if(testGeneration) await admin.from('gallery_notifications').delete().eq('generation',testGeneration);
    await admin.from('gallery_storage_history').delete().gte('measured_at',testStarted);
    await admin.from('gallery_notifications').delete().in('recipient_id',Object.values(ids));
    for(const id of Object.values(ids)){await admin.from('user_roles').delete().eq('user_id',id);await admin.auth.admin.deleteUser(id);}
    try{unlinkSync('/tmp/browser/gallery/state.json');}catch{}
  }
},300000);